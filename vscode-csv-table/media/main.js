/*
 * CSV 表格视图。
 *
 * 本视图渲染编辑器发送的内容，并且只回传两件事：用户执行的编辑（`op`），
 * 以及必须能在重新加载后保留的视图状态（`view`）。解析、序列化、排序和筛选
 * 全部位于编辑器中，因此本文件无需与文档逐字节一致。
 */
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  const ROW_HEIGHT = 26;
  const HEAD_HEIGHT = 30;
  const BUFFER_ROWS = 10;
  /** 行号列宽度，必须与 `main.css` 里的 `--rownum-width` 一致。 */
  const ROWNUM_WIDTH = 56;
  const DEFAULT_COLUMN_WIDTH = 140;
  /** 拖动超过这么多像素才算拖拽，保证单击仍然是单击。 */
  const DRAG_THRESHOLD = 4;
  const MIN_COLUMN_WIDTH = 56;
  const MAX_COLUMN_WIDTH_DEFAULT = 480;
  const AUTOFIT_SAMPLE_ROWS = 120;

  const raf =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : function (callback) {
          return window.setTimeout(callback, 16);
        };

  /* -------------------------------------------------------------- 界面文案 */

  /** 界面文案，全部为中文。 */
  const TEXT = {
    filterPlaceholder: '过滤行…',
    modeContains: '包含',
    modeEquals: '等于',
    modeStartsWith: '开头是',
    modeRegex: '正则',
    caseSensitive: '区分大小写',
    header: '表头（排序时首行保持不动）',
    headerAuto: '表头：自动',
    headerYes: '表头：是',
    headerNo: '表头：否',
    delimiter: '分隔符',
    delimiterAuto: '自动',
    addRow: '添加行',
    addColumn: '添加列',
    autoFit: '自动列宽',
    undo: '撤销 (Ctrl+Z)',
    redo: '重做 (Ctrl+Y)',
    rows: '行',
    columns: '列',
    empty: '空文件',
    createGrid: '创建 3 × 3 表格',
    truncated: '文件过大：仅显示前 {n} 行，表格为只读。',
    filtered: '已过滤',
    noSelection: '未选中',
    edit: '编辑单元格',
    copy: '复制',
    paste: '粘贴',
    pasted: '已粘贴 {rows} × {cols}',
    nothingToPaste: '剪贴板里没有可粘贴的文本。',
    readOnlyPaste: '表格为只读，无法粘贴。',
    selectFirst: '请先选中要粘贴到的单元格。',
    copyMarkdown: '复制为 Markdown 表格',
    insertRowAbove: '在上方插入行',
    insertRowBelow: '在下方插入行',
    deleteRow: '删除行',
    deleteRows: '删除选中的行',
    duplicateRow: '复制此行',
    moveRowUp: '上移一行',
    moveRowDown: '下移一行',
    sortAsc: '升序排序',
    sortDesc: '降序排序',
    sortMenu: '排序与列操作',
    sortMenuAsc: '已按该列升序排序，点击更改',
    sortMenuDesc: '已按该列降序排序，点击更改',
    filterByValue: '仅显示包含此值的行',
    clearColumnFilter: '清除此列筛选',
    clearFilters: '清除全部筛选',
    insertColumnLeft: '在左侧插入列',
    insertColumnRight: '在右侧插入列',
    deleteColumn: '删除此列',
    fitColumn: '列宽自适应',
    freeze: '锁定',
    freezeTitle: '锁定行列：滚动时固定显示表格的前几行、前几列',
    freezeRows: '锁定的行数',
    freezeColumns: '锁定的列数',
    columnPrefix: '列',
    readOnly: '（只读）',
    formulaFailed: '公式取值失败：',
    revealTarget: '定位到引用表',
    revealFailed: '定位失败：找不到被引用的单元格。',
  };

  /** 提示条里最多列出多少条公式失败原因。 */
  const FORMULA_ERROR_LIMIT = 4;

  /**
   * 取一条界面文案。
   *
   * @param {string} key - 文案键。
   * @returns {string} 对应的中文文案；未定义时返回键名本身。
   */
  function t(key) {
    const value = TEXT[key];
    return value === undefined ? key : value;
  }

  /* ---------------------------------------------------------------- 状态 */

  const model = {
    rows: [],
    visible: [],
    hasHeader: true,
    columnCount: 0,
    totalRows: 0,
    truncated: false,
    readOnly: false,
    filterError: '',
    /** 公式单元格算出来的显示值：列序号 → 与 rows 对齐的文本。 */
    resolved: {},
    /** 能定位到引用表的公式单元格：列序号 → 与 rows 对齐的 [行号, 列号]。 */
    formulaTargets: {},
    /** 公式求值失败的说明，显示在提示条里。 */
    formulaErrors: [],
    delimiter: ',',
    detectedDelimiter: ',',
    delimiterIsAuto: true,
    columnWidthMax: MAX_COLUMN_WIDTH_DEFAULT,
  };

  const view = {
    filter: { query: '', mode: 'contains', caseSensitive: false, columns: {} },
    header: 'auto',
    delimiter: 'auto',
    columnWidths: {},
    sort: null,
    frozenRows: 0,
    frozenColumns: 0,
    selection: null,
    editing: null,
    pendingRender: false,
    stateAdopted: false,
    toast: '',
  };

  let opCounter = 0;
  let headSignature = null;
  let toastTimer = null;
  let viewTimer = null;
  /** 等待浏览器 paste 事件的计时器，见 {@link beginPaste}。 */
  let pasteTimer = null;
  /** 进行中的行 / 列拖拽，格式见 {@link beginDrag}。 */
  let drag = null;
  /** 进行中的单元格拖拽选区，格式见 {@link beginCellSelect}。 */
  let cellSelect = null;
  /** 拖拽结束后浏览器还会补发一次 click，用它把那次 click 丢掉。 */
  let suppressClick = false;

  /* ------------------------------------------------------------------ DOM */

  const root = document.getElementById('app');
  const toolbar = document.getElementById('toolbar');
  const chipsBar = document.getElementById('chips');
  const banner = document.getElementById('banner');
  const scroll = document.getElementById('scroll');
  const statusBar = document.getElementById('status');
  const menu = document.getElementById('menu');

  let table = null;
  let colgroup = null;
  let thead = null;
  let tbody = null;
  let padTop = null;
  let padBottom = null;

  /** 拖拽时显示的落点指示线。 */
  const dropLine = document.createElement('div');
  dropLine.className = 'drop-line';
  dropLine.hidden = true;
  document.body.appendChild(dropLine);

  /**
   * 公式单元格的悬浮提示。
   *
   * 原生 `title` 只能显示一行纯文本，装不下「查询结果 + 完整公式」两部分，所以
   * 这里用自己的浮层：上面是算出来的值，下面是公式原文。
   */
  const tooltip = document.createElement('div');
  tooltip.className = 'cell-tooltip';
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  /** 悬浮提示对应的单元格；`null` 表示当前没显示。 */
  let tooltipCell = null;

  const controls = {};

  /* -------------------------------------------------------------- 辅助函数 */

  /**
   * 转义放入 HTML 内容的文本。
   *
   * @param {unknown} value - 原始值。
   * @returns {string} 转义后的文本。
   */
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(
      /[&<>"]/g,
      function (character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character];
      },
    );
  }

  /**
   * 转义放入双引号属性的文本。
   *
   * @param {unknown} value - 原始值。
   * @returns {string} 转义后的文本。
   */
  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  /**
   * 把从零开始的列索引渲染为电子表格列标。
   *
   * @param {number} index - 列索引。
   * @returns {string} A、B、… Z、AA、…
   */
  function columnLetter(index) {
    let remaining = index;
    let label = '';
    do {
      label = String.fromCharCode(65 + (remaining % 26)) + label;
      remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return label;
  }

  /**
   * 构建一个内联 SVG 图标元素。
   *
   * @param {string} body - SVG 子元素标记。
   * @returns {string} 该 SVG 标记。
   */
  function icon(body) {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>'
    );
  }

  const ICONS = {
    plus: icon('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'),
    columnAdd: icon(
      '<rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="9" y1="4" x2="9" y2="20"></line><line x1="15" y1="4" x2="15" y2="20"></line>',
    ),
    fit: icon(
      '<polyline points="4 9 4 4 9 4"></polyline><polyline points="15 4 20 4 20 9"></polyline><polyline points="20 15 20 20 15 20"></polyline><polyline points="9 20 4 20 4 15"></polyline>',
    ),
    undo: icon('<path d="M3 7v6h6"></path><path d="M3.5 13a9 9 0 1 0 2.3-7.4L3 8"></path>'),
    redo: icon('<path d="M21 7v6h-6"></path><path d="M20.5 13a9 9 0 1 1-2.3-7.4L21 8"></path>'),
  };

  /* ---------------------------------------------------------------- 表格 */

  /** 在滚动容器内构建表格骨架。 */
  function ensureTable() {
    if (table !== null) {
      return;
    }
    scroll.innerHTML = '';
    padTop = document.createElement('div');
    padTop.className = 'pad';
    table = document.createElement('table');
    table.className = 'csv-table';
    colgroup = document.createElement('colgroup');
    thead = document.createElement('thead');
    tbody = document.createElement('tbody');
    table.appendChild(colgroup);
    table.appendChild(thead);
    table.appendChild(tbody);
    padBottom = document.createElement('div');
    padBottom.className = 'pad';
    scroll.appendChild(padTop);
    scroll.appendChild(table);
    scroll.appendChild(padBottom);
  }

  /** 丢弃表格骨架，在文档变为空时使用。 */
  function dropTable() {
    table = null;
    colgroup = null;
    thead = null;
    tbody = null;
    padTop = null;
    padBottom = null;
    headSignature = null;
    scroll.innerHTML = '';
  }

  /** 当列数发生变化时重建列定义。 */
  function ensureColumns() {
    if (colgroup.children.length === model.columnCount + 1) {
      return;
    }
    let markup = '<col class="rownum-col">';
    for (let index = 0; index < model.columnCount; index += 1) {
      markup += '<col>';
    }
    colgroup.innerHTML = markup;
  }

  /**
   * 按显示顺序报告正文行。
   *
   * 当文档带表头时，编辑器不会把表头行放进 `visible`，
   * 因此该列表绝不包含固定表头已经显示的那一行。
   *
   * @returns {number[]} 绝对行索引。
   */
  function displayRows() {
    return model.visible.slice();
  }

  /**
   * 以规范化矩形报告当前选区。
   *
   * @returns {{r1: number, r2: number, c1: number, c2: number}|null} 该矩形。
   */
  function selectionRect() {
    const selection = view.selection;
    if (!selection) {
      return null;
    }
    return {
      r1: Math.min(selection.anchor.row, selection.focus.row),
      r2: Math.max(selection.anchor.row, selection.focus.row),
      c1: Math.min(selection.anchor.col, selection.focus.col),
      c2: Math.max(selection.anchor.col, selection.focus.col),
    };
  }

  /** 当内容发生变化时重建表头行。 */
  function renderHead() {
    const frozenColumns = Math.min(view.frozenColumns, model.columnCount);
    const signature = [
      model.columnCount,
      frozenColumns,
      view.sort ? view.sort.column + ':' + view.sort.direction : '',
    ].join('|');
    if (signature === headSignature) {
      return;
    }
    headSignature = signature;

    let markup = '<tr><th class="rownum">#</th>';
    for (let column = 0; column < model.columnCount; column += 1) {
      const sorted = view.sort !== null && view.sort.column === column;
      const glyph = sorted && view.sort.direction === 'asc' ? '▲' : '▼';
      const buttonTitle = sorted
        ? view.sort.direction === 'asc'
          ? t('sortMenuAsc')
          : t('sortMenuDesc')
        : t('sortMenu');
      const frozen = column < frozenColumns;
      markup +=
        '<th class="head-cell' +
        (frozen ? ' frozen-column frozen-cell' : '') +
        '" data-col="' +
        column +
        '" title="' +
        escapeAttr(t('columnPrefix') + ' ' + columnLetter(column)) +
        '">' +
        '<span class="head-label"><span class="letter">' +
        columnLetter(column) +
        '</span><button type="button" class="sort-button' +
        (sorted ? ' sorted' : '') +
        '" data-col="' +
        column +
        '" title="' +
        escapeAttr(buttonTitle) +
        '" aria-label="' +
        escapeAttr(buttonTitle) +
        '">' +
        glyph +
        '</button></span><span class="resizer" data-col="' +
        column +
        '"></span></th>';
    }
    thead.innerHTML = markup + '</tr>';
  }

  /**
   * 判断一个单元格是否落在当前选区内。
   *
   * 行号列当成第一列参与判断：整行选中（选区覆盖全部数据列）时它也算选中。
   * 锁定的行与列都按绝对行列号判断，因此选区同样会盖到它们上面。
   *
   * @param {number} rowIndex - 绝对行索引。
   * @param {number} column - 列索引。
   * @returns {boolean} 该单元格是否选中。
   */
  function cellIsSelected(rowIndex, column) {
    const rect = selectionRect();
    if (rect === null) {
      return false;
    }
    const width = Math.max(model.columnCount, 1);
    if (column === -1) {
      // 行号列：只有选区横跨全部列（整行选中）时才高亮。
      return rowIndex >= rect.r1 && rowIndex <= rect.r2 && rect.c1 === 0 && rect.c2 >= width - 1;
    }
    return rowIndex >= rect.r1 && rowIndex <= rect.r2 && column >= rect.c1 && column <= rect.c2;
  }

  /**
   * 渲染一行正文。
   *
   * @param {number} rowIndex - 绝对行索引。
   * @param {number} displayIndex - 在显示顺序中的下标，锁定行用它计算粘性偏移。
   * @param {boolean} frozen - 该行是否为锁定行。
   * @returns {string} 该行的标记。
   */
  function rowMarkup(rowIndex, displayIndex, frozen) {
    const row = model.rows[rowIndex] || [];
    const active = view.selection ? view.selection.focus : null;
    const frozenColumns = Math.min(view.frozenColumns, model.columnCount);
    const rowSelected = cellIsSelected(rowIndex, -1);
    let markup =
      '<tr data-display="' +
      displayIndex +
      '"' +
      (frozen ? ' class="frozen-row"' : '') +
      '><td class="rownum' +
      (rowSelected ? ' selected' : '') +
      (frozen ? ' frozen-cell' : '') +
      '" data-row="' +
      rowIndex +
      '">' +
      (rowIndex + 1) +
      '</td>';
    for (let column = 0; column < model.columnCount; column += 1) {
      const value = row[column] === undefined ? '' : row[column];
      let classes = 'cell';
      if (column < frozenColumns) {
        classes += ' frozen-column';
      }
      // 锁定行或锁定列里的单元格都算锁定区域，用来显示淡色底纹。
      if (frozen || column < frozenColumns) {
        classes += ' frozen-cell';
      }
      if (cellIsSelected(rowIndex, column)) {
        classes += ' selected';
      }
      if (active && active.row === rowIndex && active.col === column) {
        classes += ' active-cell';
      }
      const shown = displayValue(rowIndex, column, value);
      // 只有显示文本和真实内容不同（也就是公式算出了值）时才带这个属性，之后就地
      // 刷新选区、状态栏与悬浮提示都靠它判断；公式单元格不再挂原生 title，免得
      // 过一会儿又弹出一个只有公式的默认提示。
      const isFormulaCell = shown !== value;
      const displayAttribute = isFormulaCell ? ' data-display="' + escapeAttr(shown) + '"' : '';
      const titleAttribute = isFormulaCell
        ? ''
        : ' title="' + escapeAttr(value) + '"';
      markup +=
        '<td class="' +
        classes +
        '" data-row="' +
        rowIndex +
        '" data-col="' +
        column +
        '"' +
        displayAttribute +
        titleAttribute +
        '>' +
        escapeHtml(shown) +
        '</td>';
    }
    return markup + '</tr>';
  }

  /**
   * 一个单元格真实内容之外要显示的文本。
   *
   * 公式单元格显示算出来的值（宿主随 `resolved` 一起发来）；读不到时退回公式
   * 原文，让用户至少看得见自己写了什么。
   *
   * @param {number} rowIndex - 绝对行索引。
   * @param {number} column - 列索引。
   * @param {string} raw - 单元格的真实内容。
   * @returns {string} 要显示的文本。
   */
  function displayValue(rowIndex, column, raw) {
    const texts = model.resolved[column];
    if (texts === undefined) {
      return raw;
    }
    const text = texts[rowIndex];
    return typeof text === 'string' ? text : raw;
  }

  /** 渲染正文中可见的那一段。 */
  function renderBody() {
    if (table === null) {
      return;
    }
    if (view.editing) {
      view.pendingRender = true;
      return;
    }
    const rows = displayRows();
    const total = rows.length;
    const frozenRows = Math.min(view.frozenRows, total);
    const viewport = scroll.clientHeight || 400;
    const firstVisible = Math.max(0, Math.floor((scroll.scrollTop - HEAD_HEIGHT) / ROW_HEIGHT));
    const lastVisible = Math.ceil((scroll.scrollTop + viewport - HEAD_HEIGHT) / ROW_HEIGHT);
    // 锁定的行始终渲染在最前面（粘性定位依赖它们的自然位置），窗口从它们之后开始。
    const start = Math.max(frozenRows, firstVisible - BUFFER_ROWS);
    const end = Math.min(total, Math.max(start, lastVisible + BUFFER_ROWS));

    padTop.style.height = (start - frozenRows) * ROW_HEIGHT + 'px';
    padBottom.style.height = Math.max(0, (total - end) * ROW_HEIGHT) + 'px';

    let markup = '';
    // 锁定行的标记先攒起来：正文写进 DOM 后这些节点会失效，但选区状态的更新
    // 还必须落在它们身上，否则选中的列盖不住顶部锁定的行。
    let frozenMarkup = '';
    for (let index = 0; index < frozenRows; index += 1) {
      frozenMarkup += rowMarkup(rows[index], index, true);
    }
    for (let index = start; index < end; index += 1) {
      markup += rowMarkup(rows[index], index, false);
    }
    tbody.innerHTML = frozenMarkup + markup;
    const stickyCells = [];
    for (const row of tbody.querySelectorAll('tr.frozen-row')) {
      for (const cell of row.querySelectorAll('td')) {
        stickyCells.push(cell);
      }
    }
    paintStickySelection(stickyCells);
    applyStickyOffsets();
  }

  /**
   * 让选区外的粘性单元格（行号列、顶部锁定的行）跟随当前选区。
   *
   * @param {Element[]} cells - 行号列或锁定行里的单元格。
   */
  function paintStickySelection(cells) {
    for (const cell of cells) {
      const row = Number(cell.getAttribute('data-row'));
      if (cell.classList.contains('rownum')) {
        cell.classList.toggle('selected', cellIsSelected(row, -1));
        continue;
      }
      const column = Number(cell.getAttribute('data-col'));
      cell.classList.toggle('selected', cellIsSelected(row, column));
      // 公式单元格里放的显示值也要跟着一起刷新。
      setCellText(cell, row, column);
    }
  }

  /**
   * 把单元格的显示文本设成它该有的样子（公式值或原文）。
   *
   * @param {Element} cell - 目标单元格。
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   */
  function setCellText(cell, row, column) {
    const texts = model.resolved[column];
    if (texts === undefined) {
      return;
    }
    const raw = (model.rows[row] || [])[column];
    const shown = displayValue(row, column, raw === undefined ? '' : raw);
    if (cell.textContent !== shown) {
      cell.textContent = shown;
    }
  }

  /**
   * 某一列当前的像素宽度。
   *
   * @param {number} column - 列索引。
   * @returns 像素宽度。
   */
  function columnWidth(column) {
    return view.columnWidths[column] || DEFAULT_COLUMN_WIDTH;
  }

  /** 把已保存或自动计算的列宽应用到表格。 */
  function applyColumnWidths() {
    if (table === null) {
      return;
    }
    colgroup.children[0].style.width = ROWNUM_WIDTH + 'px';
    let total = ROWNUM_WIDTH;
    for (let column = 0; column < model.columnCount; column += 1) {
      total += columnWidth(column);
    }
    const target = Math.max(total, scroll.clientWidth);
    const last = model.columnCount - 1;
    for (let column = 0; column < model.columnCount; column += 1) {
      // 多余宽度全部给最后一列，其余列保持精确宽度，锁定列的左偏移才能对上。
      const width = columnWidth(column) + (column === last ? target - total : 0);
      colgroup.children[column + 1].style.width = width + 'px';
    }
    table.style.width = target + 'px';
  }

  /** 给锁定的行、列设置粘性定位偏移。 */
  function applyStickyOffsets() {
    if (table === null) {
      return;
    }
    const frozenColumns = Math.min(view.frozenColumns, model.columnCount);
    const frozenRows = Math.min(view.frozenRows, displayRows().length);

    const offsets = [];
    let left = ROWNUM_WIDTH;
    for (let column = 0; column < model.columnCount; column += 1) {
      offsets.push(left);
      left += columnWidth(column);
    }

    for (const header of thead.querySelectorAll('th.head-cell')) {
      const column = Number(header.getAttribute('data-col'));
      header.style.left = column < frozenColumns ? offsets[column] + 'px' : '';
    }

    if (tbody === null) {
      return;
    }
    for (const cell of tbody.querySelectorAll('td.frozen-column')) {
      cell.style.left = offsets[Number(cell.getAttribute('data-col'))] + 'px';
    }
    if (frozenRows > 0) {
      for (const cell of tbody.querySelectorAll('tr.frozen-row > td')) {
        const display = Number(cell.parentElement.getAttribute('data-display'));
        cell.style.top = HEAD_HEIGHT + display * ROW_HEIGHT + 'px';
      }
    }
  }

  /**
   * 使用表格字体测量文本宽度。
   *
   * @param {string} text - 要测量的文本。
   * @returns {number} 近似像素宽度。
   */
  function measureText(text) {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext && canvas.getContext('2d');
      if (context) {
        const style = window.getComputedStyle(document.body);
        context.font = style.font || style.fontFamily || '13px sans-serif';
        return context.measureText(text).width;
      }
    } catch (error) {
      // jsdom 以及任何没有 2D canvas 的环境退化为按字符数估算。
      void error;
    }
    return text.length * 7;
  }

  /**
   * 计算某一列的可读宽度。
   *
   * @param {number} column - 列索引。
   * @returns {number} 像素宽度。
   */
  function autoWidth(column) {
    let widest = 0;
    const rows = model.rows;
    const limit = Math.min(rows.length, AUTOFIT_SAMPLE_ROWS);
    for (let index = 0; index < limit; index += 1) {
      const cell = rows[index][column];
      if (cell === undefined) {
        continue;
      }
      // 量的是实际显示出来的文本：公式列量算出来的值，不是公式本身。
      const value = displayValue(index, column, cell);
      const width = measureText(value.length > 80 ? value.slice(0, 80) : value);
      if (width > widest) {
        widest = width;
      }
    }
    return Math.max(MIN_COLUMN_WIDTH, Math.min(model.columnWidthMax, Math.ceil(widest) + 26));
  }

  /** 让每一列都适应其内容。 */
  function autoFitAll() {
    const widths = {};
    for (let column = 0; column < model.columnCount; column += 1) {
      widths[column] = autoWidth(column);
    }
    view.columnWidths = widths;
    sendViewStateSoon();
    applyColumnWidths();
  }

  /* ------------------------------------------------------------- 界面外壳 */

  /** 只构建一次工具栏，使文本输入框在多次更新之间保持焦点。 */
  function buildToolbar() {
    controls.search = document.createElement('input');
    controls.search.id = 'search';
    controls.search.type = 'search';
    controls.search.className = 'search';
    controls.search.addEventListener('input', function () {
      view.filter.query = controls.search.value;
      sendViewStateSoon();
    });

    controls.mode = document.createElement('select');
    controls.mode.id = 'mode';
    [
      ['contains', 'modeContains'],
      ['equals', 'modeEquals'],
      ['startsWith', 'modeStartsWith'],
      ['regex', 'modeRegex'],
    ].forEach(function (entry) {
      const option = document.createElement('option');
      option.value = entry[0];
      option.textContent = t(entry[1]);
      controls.mode.appendChild(option);
    });
    controls.mode.addEventListener('change', function () {
      view.filter.mode = controls.mode.value;
      sendViewState();
    });

    controls.caseSensitive = makeButton(null, 'Aa', function () {
      view.filter.caseSensitive = !view.filter.caseSensitive;
      sendViewState();
      updateToolbar();
    });

    controls.header = makeButton(null, t('headerAuto'), function () {
      const order = ['auto', 'yes', 'no'];
      view.header = order[(order.indexOf(view.header) + 1) % order.length];
      sendViewState();
      updateToolbar();
    });
    controls.header.id = 'header';

    controls.delimiter = document.createElement('select');
    controls.delimiter.id = 'delimiter';
    [
      ['auto', 'delimiterAuto'],
      [',', ','],
      [';', ';'],
      ['\t', 'Tab'],
      ['|', '|'],
    ].forEach(function (entry) {
      const option = document.createElement('option');
      option.value = entry[0];
      option.textContent = t('delimiter') + ': ' + (TEXT[entry[1]] ? t(entry[1]) : entry[1]);
      controls.delimiter.appendChild(option);
    });
    controls.delimiter.addEventListener('change', function () {
      view.delimiter = controls.delimiter.value;
      sendViewState();
      updateToolbar();
    });

    controls.addRow = makeButton(ICONS.plus, t('addRow'), function () {
      sendOp({ kind: 'insertRows', index: model.rows.length, count: 1, width: model.columnCount || 1 });
    });
    controls.addColumn = makeButton(ICONS.columnAdd, t('addColumn'), function () {
      sendOp({ kind: 'insertColumns', index: model.columnCount, count: 1 });
    });
    controls.fit = makeButton(ICONS.fit, t('autoFit'), function () {
      autoFitAll();
    });
    controls.undo = makeButton(ICONS.undo, t('undo'), function () {
      vscode.postMessage({ type: 'undo' });
    });
    controls.redo = makeButton(ICONS.redo, t('redo'), function () {
      vscode.postMessage({ type: 'redo' });
    });

    // 锁定行列：两个数字输入框，形如「锁定 行 [4] 列 [2]」。
    controls.freezeLabel = document.createElement('span');
    controls.freezeLabel.className = 'info';
    controls.freezeLabel.textContent = t('freeze');

    controls.freezeRows = document.createElement('input');
    controls.freezeRows.id = 'freeze-rows';
    controls.freezeRows.type = 'number';
    controls.freezeRows.className = 'freeze-input';
    controls.freezeRows.min = '0';
    controls.freezeRows.value = '0';
    controls.freezeRows.addEventListener('change', applyFreezeInputs);

    controls.freezeRowsUnit = document.createElement('span');
    controls.freezeRowsUnit.className = 'info';
    controls.freezeRowsUnit.textContent = t('rows');

    controls.freezeColumns = document.createElement('input');
    controls.freezeColumns.id = 'freeze-columns';
    controls.freezeColumns.type = 'number';
    controls.freezeColumns.className = 'freeze-input';
    controls.freezeColumns.min = '0';
    controls.freezeColumns.value = '0';
    controls.freezeColumns.addEventListener('change', applyFreezeInputs);

    controls.freezeColumnsUnit = document.createElement('span');
    controls.freezeColumnsUnit.className = 'info';
    controls.freezeColumnsUnit.textContent = t('columns');

    controls.info = document.createElement('span');
    controls.info.className = 'info';

    const divider = document.createElement('span');
    divider.className = 'divider';

    toolbar.appendChild(controls.search);
    toolbar.appendChild(controls.mode);
    toolbar.appendChild(controls.caseSensitive);
    toolbar.appendChild(divider);
    toolbar.appendChild(controls.header);
    toolbar.appendChild(controls.delimiter);
    toolbar.appendChild(controls.freezeLabel);
    toolbar.appendChild(controls.freezeRows);
    toolbar.appendChild(controls.freezeRowsUnit);
    toolbar.appendChild(controls.freezeColumns);
    toolbar.appendChild(controls.freezeColumnsUnit);
    toolbar.appendChild(
      (function () {
        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        return spacer;
      })(),
    );
    toolbar.appendChild(controls.info);
    toolbar.appendChild(controls.addRow);
    toolbar.appendChild(controls.addColumn);
    toolbar.appendChild(controls.fit);
    toolbar.appendChild(controls.undo);
    toolbar.appendChild(controls.redo);
  }

  /**
   * 创建一个工具栏按钮。
   *
   * @param {string|null} iconMarkup - 可选的 SVG 标记。
   * @param {string} label - 无障碍标签。
   * @param {Function} onClick - 点击处理函数。
   * @returns {HTMLButtonElement} 该按钮。
   */
  function makeButton(iconMarkup, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button' + (iconMarkup ? ' icon' : '');
    button.title = label;
    button.setAttribute('aria-label', label);
    if (iconMarkup) {
      button.innerHTML = iconMarkup;
    } else {
      button.textContent = label;
    }
    button.addEventListener('click', function () {
      hideMenu();
      onClick();
    });
    return button;
  }

  /** 刷新工具栏中依赖状态的那部分内容。 */
  function updateToolbar() {
    controls.search.placeholder = t('filterPlaceholder');
    controls.mode.value = view.filter.mode;
    controls.caseSensitive.setAttribute('aria-pressed', String(view.filter.caseSensitive));
    controls.caseSensitive.title = t('caseSensitive');
    controls.header.textContent =
      view.header === 'yes' ? t('headerYes') : view.header === 'no' ? t('headerNo') : t('headerAuto');
    controls.header.title = t('header');
    controls.delimiter.value = view.delimiter;
    controls.delimiter.title = t('delimiter');
    controls.addRow.disabled = model.readOnly;
    controls.addColumn.disabled = model.readOnly;
    controls.freezeLabel.title = t('freezeTitle');
    controls.freezeRows.title = t('freezeRows');
    controls.freezeColumns.title = t('freezeColumns');
    controls.freezeRows.max = String(displayRows().length);
    controls.freezeColumns.max = String(model.columnCount);
    controls.freezeRows.disabled = model.readOnly;
    controls.freezeColumns.disabled = model.readOnly;
    // 正在输入时不要覆盖用户敲进去的内容。
    if (document.activeElement !== controls.freezeRows) {
      controls.freezeRows.value = String(Math.min(view.frozenRows, displayRows().length));
    }
    if (document.activeElement !== controls.freezeColumns) {
      controls.freezeColumns.value = String(Math.min(view.frozenColumns, model.columnCount));
    }
    controls.info.textContent =
      model.totalRows +
      ' ' +
      t('rows') +
      ' × ' +
      model.columnCount +
      ' ' +
      t('columns') +
      (model.readOnly ? t('readOnly') : '');
  }

  /** 读取工具栏上的锁定行列输入。 */
  function applyFreezeInputs() {
    const rows = Number(controls.freezeRows.value);
    const columns = Number(controls.freezeColumns.value);
    view.frozenRows = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : 0;
    view.frozenColumns = Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 0;
    constrainFreeze();
    controls.freezeRows.value = String(view.frozenRows);
    controls.freezeColumns.value = String(view.frozenColumns);
    render();
    // 锁定数量是用户设置，交给编辑器写入，下次打开任意 CSV 都会沿用。
    vscode.postMessage({
      type: 'freeze',
      frozenRows: view.frozenRows,
      frozenColumns: view.frozenColumns,
    });
  }

  /** 把锁定数量限制在当前表格范围内。 */
  function constrainFreeze() {
    view.frozenRows = Math.min(Math.max(0, view.frozenRows), displayRows().length);
    view.frozenColumns = Math.min(Math.max(0, view.frozenColumns), model.columnCount);
  }

  /** 渲染列筛选标签（chip）。 */
  function renderChips() {
    const entries = Object.keys(view.filter.columns)
      .map(Number)
      .filter(function (column) {
        return (view.filter.columns[column] || '') !== '';
      })
      .sort(function (left, right) {
        return left - right;
      });

    if (entries.length === 0) {
      chipsBar.hidden = true;
      chipsBar.textContent = '';
      return;
    }

    chipsBar.hidden = false;
    chipsBar.textContent = '';
    entries.forEach(function (column) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.appendChild(
        document.createTextNode(
          t('columnPrefix') + ' ' + columnLetter(column) + ': ' + view.filter.columns[column] + ' ',
        ),
      );
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '✕';
      remove.title = t('clearColumnFilter');
      remove.addEventListener('click', function () {
        delete view.filter.columns[column];
        sendViewState();
      });
      chip.appendChild(remove);
      chipsBar.appendChild(chip);
    });
  }

  /** 渲染网格上方的提示条。 */
  function renderBanner() {
    let message = '';
    let isError = false;
    if (model.filterError) {
      message = model.filterError;
      isError = true;
    } else if (model.formulaErrors.length > 0) {
      // 公式读不到值时保留公式原文显示，原因在这里说明。
      message = t('formulaFailed') + model.formulaErrors.slice(0, FORMULA_ERROR_LIMIT).join('；');
      if (model.formulaErrors.length > FORMULA_ERROR_LIMIT) {
        message += '；…';
      }
      isError = true;
    } else if (model.truncated) {
      message = t('truncated').replace('{n}', String(model.rows.length));
    }
    banner.hidden = message === '';
    banner.className = 'banner' + (isError ? ' error' : '');
    banner.textContent = message;
  }

  /** 渲染状态栏。 */
  function renderStatus() {
    statusBar.textContent = '';
    const address = document.createElement('span');
    const value = document.createElement('span');
    value.className = 'value';
    const focus = view.selection ? view.selection.focus : null;

    if (focus) {
      const absolute = focus.row;
      address.textContent = columnLetter(focus.col) + String(absolute + 1);
      const row = model.rows[absolute] || [];
      const raw = row[focus.col] === undefined ? '' : row[focus.col];
      // 状态栏跟着单元格显示：公式单元格显示算出来的值。
      value.textContent = displayValue(absolute, focus.col, raw);
    } else {
      address.textContent = t('noSelection');
    }

    const stats = document.createElement('span');
    const shown = model.visible.length;
    stats.className = 'spacer';
    stats.textContent =
      (view.toast ? view.toast + ' · ' : '') +
      (shown === model.totalRows
        ? model.totalRows + ' ' + t('rows')
        : shown + ' / ' + model.totalRows + ' ' + t('rows') + ' · ' + t('filtered'));

    statusBar.appendChild(address);
    statusBar.appendChild(value);
    statusBar.appendChild(stats);
  }

  /** 渲染空文档的占位内容。 */
  function renderEmpty() {
    scroll.textContent = '';
    const box = document.createElement('div');
    box.className = 'empty';
    const label = document.createElement('div');
    label.textContent = t('empty');
    const create = makeButton(ICONS.plus, t('createGrid'), function () {
      sendOp({ kind: 'initGrid', columns: 3, rows: 3 });
    });
    create.disabled = model.readOnly;
    box.appendChild(label);
    box.appendChild(create);
    scroll.appendChild(box);
  }

  /** 渲染整个视图。 */
  function render() {
    updateToolbar();
    renderChips();
    renderBanner();
    if (model.rows.length === 0) {
      dropTable();
      renderEmpty();
      renderStatus();
      return;
    }
    ensureTable();
    ensureColumns();
    renderHead();
    applyColumnWidths();
    renderBody();
    applyStickyOffsets();
    renderStatus();
  }

  /* ---------------------------------------------------------------- 编辑 */

  /**
   * 开始就地编辑一个单元格。
   *
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   */
  function startEdit(row, column) {
    if (model.readOnly || view.editing) {
      return;
    }
    const cell = tbody.querySelector('td.cell[data-row="' + row + '"][data-col="' + column + '"]');
    if (!cell) {
      return;
    }
    const input = document.createElement('input');
    input.className = 'cell-input';
    const current = (model.rows[row] || [])[column];
    const original = current === undefined ? '' : current;
    input.value = original;
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    view.editing = {
      row: row,
      column: column,
      input: input,
      cell: cell,
      original: original,
      done: false,
    };

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishEdit(false, 0, 0);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finishEdit(true, event.shiftKey ? -1 : 1, 0);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        finishEdit(true, 0, event.shiftKey ? -1 : 1);
      }
      event.stopPropagation();
    });
    input.addEventListener('blur', function () {
      finishEdit(true, 0, 0);
    });
  }

  /**
   * 提交或取消当前编辑。
   *
   * @param {boolean} commit - 是否把值写回。
   * @param {number} moveRow - 提交后移动选区的行数。
   * @param {number} moveColumn - 提交后移动选区的列数。
   */
  function finishEdit(commit, moveRow, moveColumn) {
    const editing = view.editing;
    if (!editing || editing.done) {
      return;
    }
    editing.done = true;
    view.editing = null;
    const value = editing.input.value;
    // 输入框是直接写进单元格的，因此这里必须把内容换回文本：视图只在数据变化
    // 时才重建正文，不会再顺手清掉输入框。
    const raw = commit ? value : editing.original;
    // 单元格里要显示的是公式算出来的值（如果有），但真实内容始终是公式原文。
    editing.cell.textContent = displayValue(editing.row, editing.column, raw);
    editing.cell.setAttribute('title', raw);
    if (commit && value !== editing.original) {
      sendOp({ kind: 'setCell', row: editing.row, column: editing.column, value: value });
    }
    if (moveRow !== 0 || moveColumn !== 0) {
      navigate(moveRow, moveColumn, false);
    } else {
      paintSelection();
      renderStatus();
    }
  }

  /* ---------------------------------------------------------------- 操作 */

  /**
   * 向编辑器发送一次编辑操作。
   *
   * @param {object} op - 操作负载。
   */
  function sendOp(op) {
    opCounter += 1;
    vscode.postMessage({ type: 'op', opId: opCounter, op: op });
  }

  /** 把当前视图状态发送给编辑器。 */
  function sendViewState() {
    vscode.postMessage({
      type: 'view',
      state: {
        delimiter: view.delimiter,
        header: view.header,
        filter: view.filter,
        columnWidths: view.columnWidths,
        sort: view.sort,
      },
    });
  }

  /** 短暂延迟后发送视图状态，用于连续输入的场景。 */
  function sendViewStateSoon() {
    if (viewTimer !== null) {
      window.clearTimeout(viewTimer);
    }
    viewTimer = window.setTimeout(function () {
      viewTimer = null;
      sendViewState();
    }, 160);
  }

  /**
   * 移动选区。
   *
   * @param {number} deltaRow - 按显示顺序移动的行数。
   * @param {number} deltaColumn - 移动的列数。
   * @param {boolean} extend - 是否保留原锚点。
   */
  function navigate(deltaRow, deltaColumn, extend) {
    const rows = displayRows();
    if (rows.length === 0 || model.columnCount === 0) {
      return;
    }
    const current = view.selection || {
      anchor: { row: rows[0], col: 0 },
      focus: { row: rows[0], col: 0 },
    };
    let index = rows.indexOf(current.focus.row);
    if (index < 0) {
      index = 0;
    }
    const nextIndex = Math.min(rows.length - 1, Math.max(0, index + deltaRow));
    const nextColumn = Math.min(
      model.columnCount - 1,
      Math.max(0, current.focus.col + deltaColumn),
    );
    const focus = { row: rows[nextIndex], col: nextColumn };
    view.selection = extend ? { anchor: current.anchor, focus: focus } : { anchor: focus, focus: focus };
    const previousScrollTop = scroll.scrollTop;
    scrollIntoView(nextIndex);
    // 只有滚动位置变化、需要换一批行时才重建正文。
    if (scroll.scrollTop === previousScrollTop) {
      paintSelection();
      renderStatus();
    } else {
      renderBody();
    }
  }

  /**
   * 滚动视图，使某个显示行保持在固定表头与锁定行下方的可见区域内。
   *
   * @param {number} index - 显示顺序中的索引。
   */
  function scrollIntoView(index) {
    const frozenRows = Math.min(view.frozenRows, displayRows().length);
    // 锁定的行一直显示在顶部，不需要为它们滚动。
    if (index < frozenRows) {
      return;
    }
    const top = HEAD_HEIGHT + index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const visibleTop = scroll.scrollTop + HEAD_HEIGHT + frozenRows * ROW_HEIGHT;
    const visibleBottom = scroll.scrollTop + (scroll.clientHeight || 400);
    if (top < visibleTop) {
      scroll.scrollTop = top - HEAD_HEIGHT - frozenRows * ROW_HEIGHT;
    } else if (bottom > visibleBottom) {
      scroll.scrollTop = bottom - (scroll.clientHeight || 400);
    }
  }

  /**
   * 就地刷新选区的样式。
   *
   * 选中单元格时不能重建正文：两次点击之间一旦换掉单元格节点，浏览器就会把
   * 点击计数重置为 1，`dblclick`（双击进入编辑）也就永远不会触发。整行 / 整列
   * 选中需要改行号列与顶部锁定行的节点，因此那里改用 {@link renderBody}。
   *
   * 行号列与顶部锁定行不参与 `tbody.innerHTML` 的日常重绘，这里同样要补刷一遍。
   */
  function paintSelection() {
    if (table === null) {
      return;
    }
    const active = view.selection ? view.selection.focus : null;
    scroll.classList.toggle('selecting', cellSelect !== null && cellSelect.active);
    const cells = tbody.querySelectorAll('td.cell');
    for (const cell of cells) {
      const row = Number(cell.getAttribute('data-row'));
      const column = Number(cell.getAttribute('data-col'));
      cell.classList.toggle('selected', cellIsSelected(row, column));
      cell.classList.toggle(
        'active-cell',
        active !== null && active.row === row && active.col === column,
      );
      setCellText(cell, row, column);
    }
    // 行号列与顶部锁定的行不在 td.cell 里，单独刷一遍，保证选区颜色完整。
    const extras = [];
    for (const rownum of tbody.querySelectorAll('td.rownum')) {
      extras.push(rownum);
    }
    for (const row of tbody.querySelectorAll('tr.frozen-row')) {
      for (const cell of row.querySelectorAll('td.cell')) {
        extras.push(cell);
      }
    }
    paintStickySelection(extras);
  }

  /**
   * 选中一个单元格。
   *
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   * @param {boolean} extend - 是否保留已有的锚点。
   */
  function selectCell(row, column, extend) {
    const anchor = extend && view.selection ? view.selection.anchor : { row: row, col: column };
    view.selection = { anchor: anchor, focus: { row: row, col: column } };
    paintSelection();
    renderStatus();
  }

  /**
   * 选中整行。
   *
   * @param {number} row - 绝对行索引。
   * @param {boolean} extend - 是否保留已有的锚点（Shift 扩展）。
   */
  function selectRow(row, extend) {
    const anchor = extend && view.selection ? view.selection.anchor : { row: row, col: 0 };
    view.selection = {
      anchor: anchor,
      focus: { row: row, col: Math.max(0, model.columnCount - 1) },
    };
    // 行号列的高亮要跟着整行选区一起变，所以这里重建正文而不是就地刷样式。
    renderBody();
    renderStatus();
  }

  /**
   * 选中整列，用于点击列号行。
   *
   * @param {number} column - 列索引。
   * @param {boolean} extend - 是否保留已有的锚点（Shift 扩展）。
   */
  function selectColumn(column, extend) {
    const rows = displayRows();
    if (rows.length === 0) {
      return;
    }
    // 锚点从第 0 行（而不是第一行可见行）开始：顶部锁定的行属于整张表，
    // 整列选中必须把它们的颜色也带上。
    const anchor = extend && view.selection ? view.selection.anchor : { row: 0, col: column };
    view.selection = {
      anchor: anchor,
      focus: { row: rows[rows.length - 1], col: column },
    };
    renderBody();
    renderStatus();
  }

  /**
   * 以行优先矩阵读取选中的单元格。
   *
   * @returns {string[][]|null} 选中的值；没有选区时为 `null`。
   */
  function selectionMatrix() {
    const rect = selectionRect();
    if (!rect) {
      return null;
    }
    const matrix = [];
    for (let row = rect.r1; row <= rect.r2; row += 1) {
      const source = model.rows[row] || [];
      const line = [];
      for (let column = rect.c1; column <= rect.c2; column += 1) {
        line.push(source[column] === undefined ? '' : source[column]);
      }
      matrix.push(line);
    }
    return matrix;
  }

  /**
   * 把粘贴板文本切分成矩阵。
   *
   * 复制出来的内容在选区内部用制表符、行与行之间用换行分隔；末尾的那个换行
   * 只是文本结束的标志，不构成额外一行。
   *
   * @param {string} text - 剪贴板文本。
   * @returns {string[][]} 按行排列的单元格；没有可用内容时为空数组。
   */
  function parseClipboardText(text) {
    const normalized = String(text === undefined || text === null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '');
    if (normalized === '') {
      return [];
    }
    return normalized.split('\n').map(function (line) {
      return line.split('\t');
    });
  }

  /**
   * 把粘贴内容写到当前选区的左上角。
   *
   * 单行或单列的粘贴块会铺满整个选区，与电子表格的习惯一致；其余情况以
   * 选区左上角为锚点，按块自身的大小展开。
   *
   * @param {string[][]} matrix - 剪贴板内容。
   * @returns {boolean} 是否发出了修改。
   */
  function pasteMatrix(matrix) {
    if (model.readOnly || matrix.length === 0) {
      return false;
    }
    const rect = selectionRect();
    if (!rect) {
      return false;
    }
    const blockWidth = matrix.reduce(function (widest, line) {
      return Math.max(widest, line.length);
    }, 0);
    if (blockWidth === 0) {
      return false;
    }
    const selectionWidth = rect.c2 - rect.c1 + 1;
    const selectionHeight = rect.r2 - rect.r1 + 1;
    // 只有一个值的粘贴块铺满整个选区，与电子表格的习惯一致；多行多列的块则
    // 按自身大小展开，选区左上角就是锚点。
    const repeatAcross = matrix.length === 1 ? selectionWidth : 1;
    const repeatDown = blockWidth === 1 ? selectionHeight : 1;
    const values = [];
    for (let row = 0; row < matrix.length * repeatDown; row += 1) {
      const line = [];
      for (let column = 0; column < blockWidth * repeatAcross; column += 1) {
        const cell = matrix[row % matrix.length][column % blockWidth];
        line.push(cell === undefined ? '' : cell);
      }
      values.push(line);
    }
    const lastRow = Math.min(model.rows.length - 1, rect.r1 + values.length - 1);
    const lastColumn = rect.c1 + values[0].length - 1;
    sendOp({ kind: 'setRange', row: rect.r1, column: rect.c1, values: values });
    view.selection = {
      anchor: { row: rect.r1, col: rect.c1 },
      focus: { row: lastRow, col: lastColumn },
    };
    paintSelection();
    renderStatus();
    toast(
      t('pasted')
        .replace('{rows}', String(values.length))
        .replace('{cols}', String(values[0].length)),
    );
    return true;
  }

  /**
   * 粘贴输入的文本。
   *
   * @param {string} text - 剪贴板文本。
   */
  function pasteText(text) {
    if (model.readOnly) {
      toast(t('readOnlyPaste'));
      return;
    }
    const matrix = parseClipboardText(text);
    if (matrix.length === 0) {
      toast(t('nothingToPaste'));
      return;
    }
    if (!pasteMatrix(matrix)) {
      toast(t('selectFirst'));
    }
  }

  /**
   * 一次粘贴请求：先等浏览器随 paste 事件给出的文本，拿不到再退到
   * `navigator.clipboard`，最后交给编辑器读取。
   *
   * 这条路径不依赖编辑器消息往返，因此 Ctrl+V 在绝大多数情况下都是即时的。
   */
  function beginPaste() {
    if (model.readOnly) {
      toast(t('readOnlyPaste'));
      return;
    }
    if (!selectionRect()) {
      toast(t('selectFirst'));
      return;
    }
    if (pasteTimer !== null) {
      window.clearTimeout(pasteTimer);
    }
    pasteTimer = window.setTimeout(function () {
      pasteTimer = null;
      readClipboardText();
    }, 120);
  }

  /** 剪贴板事件没有给出文本时的回退路径。 */
  function readClipboardText() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard
        .readText()
        .then(function (text) {
          pasteText(text);
        })
        .catch(function () {
          vscode.postMessage({ type: 'readClipboard' });
        });
      return;
    }
    vscode.postMessage({ type: 'readClipboard' });
  }

  /**
   * 处理粘贴事件，文本由浏览器随事件一起给出。
   *
   * @param {ClipboardEvent} event - 粘贴事件。
   * @returns {boolean} 是否已经用事件里的文本完成了粘贴。
   */
  function handlePasteEvent(event) {
    const data = event.clipboardData;
    if (!data || typeof data.getData !== 'function') {
      return false;
    }
    // 先认领这次粘贴，随后到达的编辑器回包不会再粘一遍。
    if (pasteTimer !== null) {
      window.clearTimeout(pasteTimer);
      pasteTimer = null;
    }
    if (model.readOnly || !selectionRect()) {
      return true;
    }
    const text = data.getData('text/plain');
    if (typeof text !== 'string' || text === '') {
      // 剪贴板里没有文本（例如图片），请求仍然到此为止。
      return true;
    }
    pasteText(text);
    return true;
  }

  /**
   * 把文本复制到剪贴板，失败时回退到编辑器。
   *
   * @param {string} text - 要复制的文本。
   */
  function copyText(text) {
    const fallback = function () {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand && document.execCommand('copy');
        document.body.removeChild(area);
        if (!copied) {
          vscode.postMessage({ type: 'clipboard', text: text });
        }
      } catch (error) {
        vscode.postMessage({ type: 'clipboard', text: text });
        void error;
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }
  }

  /** 把选区复制为制表符分隔的值。 */
  function copySelection() {
    const matrix = selectionMatrix();
    if (!matrix) {
      return;
    }
    copyText(
      matrix
        .map(function (line) {
          return line.join('\t');
        })
        .join('\n'),
    );
  }

  /** 把选区复制为 Markdown 表格。 */
  function copySelectionAsMarkdown() {
    const matrix = selectionMatrix();
    if (!matrix || matrix.length === 0) {
      return;
    }
    const escape = function (value) {
      return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    };
    const lines = ['| ' + matrix[0].map(escape).join(' | ') + ' |'];
    lines.push('| ' + matrix[0].map(function () {
      return '---';
    }).join(' | ') + ' |');
    for (let index = 1; index < matrix.length; index += 1) {
      lines.push('| ' + matrix[index].map(escape).join(' | ') + ' |');
    }
    copyText(lines.join('\n'));
  }

  /**
   * 在状态栏显示一条临时消息。
   *
   * @param {string} message - 要显示的消息。
   */
  function toast(message) {
    view.toast = message;
    renderStatus();
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(function () {
      toastTimer = null;
      view.toast = '';
      renderStatus();
    }, 4000);
  }

  /**
   * 判断事件目标是表单控件。
   *
   * 就地编辑的输入框、工具栏的下拉框都算：落在它们身上的键盘、粘贴与鼠标事件
   * 要交给控件自己处理，表格的选区与快捷键必须让路。
   *
   * @param {EventTarget|null} target - 事件目标。
   * @returns 是否是输入类控件。
   */
  function isTypingTarget(target) {
    return (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    );
  }

  /* -------------------------------------------------------------- 公式悬浮提示 */

  /**
   * 显示公式单元格的悬浮提示：上面是查询结果，下面是完整公式。
   *
   * @param {Element} cell - 公式单元格。
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   * @param {MouseEvent} event - 触发显示的事件，用来定位浮层。
   */
  function showCellTooltip(cell, row, column, event) {
    const raw = (model.rows[row] || [])[column];
    if (raw === undefined) {
      return;
    }
    const shown = displayValue(row, column, raw);
    const markup =
      '<div class="tooltip-value">' +
      escapeHtml(shown) +
      '</div><div class="tooltip-formula">' +
      escapeHtml(raw) +
      '</div>';
    if (tooltipCell !== cell || tooltip.innerHTML !== markup) {
      tooltip.innerHTML = markup;
    }
    tooltipCell = cell;
    tooltip.hidden = false;
    positionTooltip(event);
  }

  /**
   * 把浮层放在指针右下方；贴到窗口边缘时自动翻到另一侧。
   *
   * @param {MouseEvent} event - 指针事件。
   */
  function positionTooltip(event) {
    if (tooltip.hidden || event === undefined) {
      return;
    }
    const margin = 14;
    const rect = tooltip.getBoundingClientRect();
    const width = window.innerWidth || 800;
    const height = window.innerHeight || 600;
    let left = event.clientX + margin;
    let top = event.clientY + margin;
    if (rect.width > 0 && left + rect.width > width - 4) {
      left = Math.max(4, event.clientX - margin - rect.width);
    }
    if (rect.height > 0 && top + rect.height > height - 4) {
      top = Math.max(4, event.clientY - margin - rect.height);
    }
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  /** 隐藏悬浮提示。 */
  function hideCellTooltip() {
    if (tooltipCell === null && tooltip.hidden) {
      return;
    }
    tooltipCell = null;
    tooltip.hidden = true;
    tooltip.textContent = '';
  }

  /* ----------------------------------------------------------- 上下文菜单 */

  /** 隐藏上下文菜单。 */
  function hideMenu() {
    menu.hidden = true;
    menu.textContent = '';
  }

  /**
   * 一个单元格能不能「定位到引用表」。
   *
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   * @returns {number[]|null} 被引用表里的 `[行号, 列号]`；不能定位时为 `null`。
   */
  function revealTargetAt(row, column) {
    const columnTargets = model.formulaTargets[column];
    if (columnTargets === undefined) {
      return null;
    }
    const target = columnTargets[row];
    return Array.isArray(target) && target.length === 2 ? target : null;
  }

  /**
   * 请宿主打开公式引用的表并定位到取值的那一格。
   *
   * @param {number} row - 公式所在的绝对行索引。
   * @param {number} column - 公式所在的列索引。
   */
  function revealReference(row, column) {
    const formula = (model.rows[row] || [])[column];
    if (formula === undefined || revealTargetAt(row, column) === null) {
      toast(t('revealFailed'));
      return;
    }
    vscode.postMessage({ type: 'reveal', formula: formula, row: row, column: column });
  }

  /**
   * 滚动并选中某个单元格。
   *
   * 这是「定位到引用表」的落点：被引用的表打开后，宿主把目标行列推回来。
   * 目标行被过滤掉、或者列号超出表格范围时只提示，不会硬把选区设到看不见的地方。
   *
   * @param {number} row - 目标单元格的行索引。
   * @param {number} column - 目标单元格的列索引。
   */
  function revealCell(row, column) {
    const validColumn =
      Number.isInteger(column) && column >= 0 && column < model.columnCount ? column : null;
    if (validColumn === null || row < 0 || model.rows[row] === undefined) {
      toast(t('revealFailed'));
      vscode.postMessage({ type: 'revealAck' });
      return;
    }
    const index = displayRows().indexOf(row);
    if (index < 0) {
      toast(t('revealFailed'));
      vscode.postMessage({ type: 'revealAck' });
      return;
    }
    scrollIntoView(index);
    // 滚动只是改了 scrollTop，正文要重建一次才会按新窗口渲染出目标行。
    renderBody();
    selectCell(row, validColumn, false);
    // 把键盘焦点交给表格，否则选区画出来了但用户看不出来（尤其是刚打开这张表时）。
    if (typeof scroll.focus === 'function') {
      scroll.focus({ preventScroll: true });
    }
    vscode.postMessage({ type: 'revealAck' });
  }

  /**
   * 在指定位置显示上下文菜单。
   *
   * @param {number} x - 视口 x 坐标。
   * @param {number} y - 视口 y 坐标。
   * @param {Array<object>} items - 菜单项。
   */
  function showMenu(x, y, items) {
    menu.textContent = '';
    items.forEach(function (item) {
      if (item.separator) {
        const line = document.createElement('div');
        line.className = 'menu-separator';
        menu.appendChild(line);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      // 勾选标记用于显示当前生效的排序方向。
      button.textContent = (item.checked === true ? '✓ ' : '') + item.label;
      button.disabled = item.disabled === true;
      button.addEventListener('click', function () {
        hideMenu();
        item.run();
      });
      menu.appendChild(button);
    });
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, Math.max(0, (window.innerWidth || 800) - rect.width - 4));
    const top = Math.min(y, Math.max(0, (window.innerHeight || 600) - rect.height - 4));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  /**
   * 为正文单元格构建菜单。
   *
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   * @returns {Array<object>} 菜单项。
   */
  function cellMenuItems(row, column) {
    const rect = selectionRect();
    const multipleRows = rect !== null && rect.r2 > rect.r1;
    const selectedRows = rect !== null && row >= rect.r1 && row <= rect.r2;
    const value = (model.rows[row] || [])[column];
    // 取到值的公式单元格才能定位：宿主随 resolved 一起给了目标格的行列。
    const target = revealTargetAt(row, column);
    const items = [
      { label: t('edit'), run: function () { startEdit(row, column); }, disabled: model.readOnly },
      { label: t('copy'), run: copySelection },
      { label: t('paste'), run: beginPaste, disabled: model.readOnly },
      { label: t('copyMarkdown'), run: copySelectionAsMarkdown },
      {
        label: t('revealTarget'),
        run: function () {
          revealReference(row, column);
        },
        disabled: target === null,
      },
      { separator: true },
      {
        label: t('insertRowAbove'),
        run: function () {
          sendOp({ kind: 'insertRows', index: row, count: 1, width: model.columnCount });
        },
        disabled: model.readOnly,
      },
      {
        label: t('insertRowBelow'),
        run: function () {
          sendOp({ kind: 'insertRows', index: row + 1, count: 1, width: model.columnCount });
        },
        disabled: model.readOnly,
      },
      {
        label: multipleRows && selectedRows ? t('deleteRows') : t('deleteRow'),
        run: function () {
          const indices = [];
          if (multipleRows && selectedRows) {
            for (let index = rect.r1; index <= rect.r2; index += 1) {
              indices.push(index);
            }
          } else {
            indices.push(row);
          }
          sendOp({ kind: 'deleteRows', indices: indices });
          view.selection = null;
        },
        disabled: model.readOnly,
      },
      {
        label: t('duplicateRow'),
        run: function () {
          sendOp({ kind: 'insertRows', index: row + 1, count: 1, width: model.columnCount });
          sendOp({ kind: 'setRow', row: row + 1, values: model.rows[row] || [] });
        },
        disabled: model.readOnly,
      },
      {
        label: t('moveRowUp'),
        run: function () {
          sendOp({ kind: 'moveRow', from: row, to: row - 1 });
        },
        disabled: model.readOnly || row <= (model.hasHeader ? 1 : 0),
      },
      {
        label: t('moveRowDown'),
        run: function () {
          sendOp({ kind: 'moveRow', from: row, to: row + 1 });
        },
        disabled: model.readOnly || row >= model.rows.length - 1,
      },
      { separator: true },
      {
        label: t('sortAsc'),
        checked: view.sort !== null && view.sort.column === column && view.sort.direction === 'asc',
        run: function () {
          sendOp({ kind: 'sort', column: column, direction: 'asc', hasHeader: model.hasHeader });
        },
        disabled: model.readOnly,
      },
      {
        label: t('sortDesc'),
        checked: view.sort !== null && view.sort.column === column && view.sort.direction === 'desc',
        run: function () {
          sendOp({ kind: 'sort', column: column, direction: 'desc', hasHeader: model.hasHeader });
        },
        disabled: model.readOnly,
      },
      {
        label: t('filterByValue'),
        run: function () {
          view.filter.columns[column] = value === undefined ? '' : value;
          sendViewState();
        },
      },
      { separator: true },
      {
        label: t('insertColumnLeft'),
        run: function () {
          sendOp({ kind: 'insertColumns', index: column, count: 1 });
        },
        disabled: model.readOnly,
      },
      {
        label: t('insertColumnRight'),
        run: function () {
          sendOp({ kind: 'insertColumns', index: column + 1, count: 1 });
        },
        disabled: model.readOnly,
      },
      {
        label: t('deleteColumn'),
        run: function () {
          sendOp({ kind: 'deleteColumns', indices: [column] });
        },
        disabled: model.readOnly || model.columnCount <= 1,
      },
      {
        label: t('fitColumn'),
        run: function () {
          view.columnWidths[column] = autoWidth(column);
          sendViewState();
          applyColumnWidths();
        },
      },
    ];
    if (Object.keys(view.filter.columns).length > 0) {
      items.push(
        { separator: true },
        {
          label: t('clearColumnFilter'),
          run: function () {
            delete view.filter.columns[column];
            sendViewState();
          },
        },
        {
          label: t('clearFilters'),
          run: function () {
            view.filter.columns = {};
            view.filter.query = '';
            controls.search.value = '';
            sendViewState();
          },
        },
      );
    }
    return items;
  }

  /**
   * 为列表头构建菜单。
   *
   * @param {number} column - 列索引。
   * @returns {Array<object>} 菜单项。
   */
  function headerMenuItems(column) {
    return [
      {
        label: t('sortAsc'),
        checked: view.sort !== null && view.sort.column === column && view.sort.direction === 'asc',
        run: function () {
          sendOp({ kind: 'sort', column: column, direction: 'asc', hasHeader: model.hasHeader });
        },
        disabled: model.readOnly,
      },
      {
        label: t('sortDesc'),
        checked: view.sort !== null && view.sort.column === column && view.sort.direction === 'desc',
        run: function () {
          sendOp({ kind: 'sort', column: column, direction: 'desc', hasHeader: model.hasHeader });
        },
        disabled: model.readOnly,
      },
      { separator: true },
      {
        label: t('insertColumnLeft'),
        run: function () {
          sendOp({ kind: 'insertColumns', index: column, count: 1 });
        },
        disabled: model.readOnly,
      },
      {
        label: t('insertColumnRight'),
        run: function () {
          sendOp({ kind: 'insertColumns', index: column + 1, count: 1 });
        },
        disabled: model.readOnly,
      },
      {
        label: t('deleteColumn'),
        run: function () {
          sendOp({ kind: 'deleteColumns', indices: [column] });
        },
        disabled: model.readOnly || model.columnCount <= 1,
      },
      { separator: true },
      {
        label: t('filterByValue'),
        run: function () {
          const value = (model.rows[0] || [])[column];
          view.filter.columns[column] = value === undefined ? '' : value;
          sendViewState();
        },
      },
      {
        label: t('fitColumn'),
        run: function () {
          view.columnWidths[column] = autoWidth(column);
          sendViewState();
          applyColumnWidths();
        },
      },
    ];
  }

  /* -------------------------------------------------------------- 监听器 */

  /** 绑定表格上委托的指针与键盘处理函数。 */
  function wireGrid() {
    scroll.addEventListener('scroll', function () {
      // 滚动之后浮层的位置与目标单元格都对不上了，直接收起来。
      hideCellTooltip();
      raf(function () {
        renderBody();
      });
    });

    // 公式单元格的悬浮提示：进入表格时判断，指针移动时跟随。
    scroll.addEventListener('mouseover', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const cell = target.closest('td.cell');
      if (!cell || !cell.hasAttribute('data-display')) {
        hideCellTooltip();
        return;
      }
      showCellTooltip(
        cell,
        Number(cell.getAttribute('data-row')),
        Number(cell.getAttribute('data-col')),
        event,
      );
    });
    scroll.addEventListener('mousemove', function (event) {
      if (tooltipCell !== null) {
        positionTooltip(event);
      }
    });
    scroll.addEventListener('mouseleave', hideCellTooltip);
    scroll.addEventListener('mousedown', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      hideCellTooltip();
      // 正在就地编辑：输入框上的按下交给它自己处理（定位光标、拖选文字），
      // 否则这里会把焦点抢到滚动容器，输入框失焦直接提交并退出编辑。
      if (isTypingTarget(target)) {
        return;
      }
      suppressClick = false;
      if (target.classList.contains('resizer')) {
        beginResize(event, Number(target.getAttribute('data-col')));
        return;
      }
      if (target.closest('.sort-button')) {
        // 下拉三角由 click 处理器打开菜单，不参与列拖拽。
        return;
      }
      const header = target.closest('th.head-cell');
      if (header) {
        const column = Number(header.getAttribute('data-col'));
        const rect = selectionRect();
        // 按住 Shift 扩展列选区；已经在多列选区里就保留它，便于整块拖动；
        // 其余情况改为选中该列。
        if (event.shiftKey) {
          selectColumn(column, true);
        } else if (!(rect && rect.c2 > rect.c1 && column >= rect.c1 && column <= rect.c2)) {
          selectColumn(column, false);
        }
        hideMenu();
        beginDrag(event, 'column', column);
        return;
      }
      const cell = target.closest('td');
      if (!cell || !cell.hasAttribute('data-row')) {
        return;
      }
      hideMenu();
      if (cell.classList.contains('rownum')) {
        const row = Number(cell.getAttribute('data-row'));
        const rect = selectionRect();
        // 按住 Shift 扩展行选区；已经在多行选区里就保留它，便于整块拖动；
        // 其余情况改为选中该行。
        if (event.shiftKey) {
          selectRow(row, true);
        } else if (!(rect && rect.r2 > rect.r1 && row >= rect.r1 && row <= rect.r2)) {
          selectRow(row, false);
        }
        beginDrag(event, 'row', row);
        return;
      }
      if (cell.hasAttribute('data-col')) {
        beginCellSelect(event, Number(cell.getAttribute('data-row')), Number(cell.getAttribute('data-col')));
      }
    });

    scroll.addEventListener('dblclick', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const header = target.closest('th.head-cell');
      if (header) {
        // 表头只有列号，双击不进入编辑。
        return;
      }
      const cell = target.closest('td.cell');
      if (!cell) {
        return;
      }
      startEdit(Number(cell.getAttribute('data-row')), Number(cell.getAttribute('data-col')));
    });

    scroll.addEventListener('contextmenu', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const header = target.closest('th.head-cell');
      const cell = target.closest('td.cell');
      const rownum = target.closest('td.rownum');
      event.preventDefault();
      if (header) {
        showMenu(event.clientX, event.clientY, headerMenuItems(Number(header.getAttribute('data-col'))));
        return;
      }
      if (cell) {
        const row = Number(cell.getAttribute('data-row'));
        const column = Number(cell.getAttribute('data-col'));
        if (!view.selection || row < selectionRect().r1 || row > selectionRect().r2) {
          selectCell(row, column, false);
        }
        showMenu(event.clientX, event.clientY, cellMenuItems(row, column));
        return;
      }
      if (rownum) {
        const row = Number(rownum.getAttribute('data-row'));
        // 与按下行号列一致：右键选中的是整行，行号列也一起高亮。
        selectRow(row, false);
        showMenu(
          event.clientX,
          event.clientY,
          cellMenuItems(row, 0).filter(function (item) {
            return item.separator || item.label !== t('edit');
          }),
        );
      }
    });

    scroll.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element) || target.classList.contains('resizer')) {
        return;
      }
      if (suppressClick) {
        // 刚结束一次拖拽，忽略随后补发的 click。
        suppressClick = false;
        return;
      }
      const sortButton = target.closest('.sort-button');
      if (sortButton) {
        const column = Number(sortButton.getAttribute('data-col'));
        const bounds = sortButton.getBoundingClientRect();
        showMenu(bounds.left, bounds.bottom + 2, headerMenuItems(column));
        return;
      }
      const header = target.closest('th.head-cell');
      if (header !== null && !event.shiftKey) {
        selectColumn(Number(header.getAttribute('data-col')), false);
      }
    });
  }

  /**
   * 开始拖拽列边界。
   *
   * @param {MouseEvent} event - mousedown 事件。
   * @param {number} column - 列索引。
   */
  function beginResize(event, column) {
    event.preventDefault();
    const header = thead.querySelector('th.head-cell[data-col="' + column + '"]');
    if (!header) {
      return;
    }
    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    const move = function (moveEvent) {
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
      view.columnWidths[column] = width;
      applyColumnWidths();
      applyStickyOffsets();
    };
    const up = function () {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      sendViewState();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /* ------------------------------------------------------------ 拖拽移动 */

  /**
   * 准备拖拽选中的行或列。
   *
   * 按下的行号 / 列号若落在当前选区内，就拖动整个选区；否则只拖动按下的那一行 / 列
   * （此时选区已在 mousedown 处理器里更新过）。
   *
   * @param {MouseEvent} event - mousedown 事件。
   * @param {string} kind - `'row'` 或 `'column'`。
   * @param {number} index - 按下的行号或列号。
   */
  function beginDrag(event, kind, index) {
    if (model.readOnly) {
      return;
    }
    // 上一次拖拽若因丢失 mouseup 而未收尾，先清理掉。
    if (drag !== null) {
      endDrag();
    }
    const rect = selectionRect();
    let start = index;
    let end = index;
    if (rect !== null) {
      if (kind === 'row' && index >= rect.r1 && index <= rect.r2) {
        start = rect.r1;
        end = rect.r2;
      } else if (kind === 'column' && index >= rect.c1 && index <= rect.c2) {
        start = rect.c1;
        end = rect.c2;
      }
    }
    const indices = [];
    for (let value = start; value <= end; value += 1) {
      indices.push(value);
    }
    drag = {
      kind: kind,
      indices: indices,
      startX: event.clientX,
      startY: event.clientY,
      target: null,
      active: false,
    };
    event.preventDefault();
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  /**
   * 计算当前指针位置对应的落点。
   *
   * @param {MouseEvent} event - mousemove 事件。
   * @returns {number|null} 落点行列号；指针不在可放置区域时为 `null`。
   */
  function dragTarget(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (drag.kind === 'row') {
      const cell = element && element.closest ? element.closest('tbody td[data-row]') : null;
      if (cell !== null) {
        const bounds = cell.parentElement.getBoundingClientRect();
        const row = Number(cell.getAttribute('data-row'));
        return event.clientY > bounds.top + bounds.height / 2 ? row + 1 : row;
      }
      const bounds = tbody.getBoundingClientRect();
      if (bounds.height === 0) {
        return null;
      }
      return event.clientY < bounds.top ? 0 : model.rows.length;
    }
    const header = element && element.closest ? element.closest('th.head-cell') : null;
    if (header !== null) {
      const bounds = header.getBoundingClientRect();
      const column = Number(header.getAttribute('data-col'));
      return event.clientX > bounds.left + bounds.width / 2 ? column + 1 : column;
    }
    const headers = thead.querySelectorAll('th.head-cell');
    if (headers.length === 0) {
      return null;
    }
    const first = headers[0].getBoundingClientRect();
    const last = headers[headers.length - 1].getBoundingClientRect();
    if (event.clientX < first.left) {
      return 0;
    }
    return event.clientX > last.right ? model.columnCount : null;
  }

  /**
   * 高亮（或取消高亮）正在拖动的行列。
   *
   * @param {string} kind - `'row'` 或 `'column'`。
   * @param {number[]} indices - 参与拖动的行列号。
   * @param {boolean} on - 是否高亮。
   */
  function markDragSource(kind, indices, on) {
    const container = kind === 'row' ? tbody : thead;
    if (container === null) {
      return;
    }
    const attribute = kind === 'row' ? 'data-row' : 'data-col';
    const cells = container.querySelectorAll(kind === 'row' ? 'td.rownum' : 'th.head-cell');
    for (const cell of cells) {
      cell.classList.toggle(
        'dragging',
        on && indices.indexOf(Number(cell.getAttribute(attribute))) >= 0,
      );
    }
  }

  /**
   * 显示落点指示线。
   *
   * @param {number} target - 落点行列号。
   */
  function showDropLine(target) {
    const bounds = scroll.getBoundingClientRect();
    dropLine.hidden = false;
    if (drag.kind === 'row') {
      const y = Math.max(
        bounds.top,
        Math.min(bounds.bottom, bounds.top + HEAD_HEIGHT + target * ROW_HEIGHT - scroll.scrollTop),
      );
      dropLine.className = 'drop-line horizontal';
      dropLine.style.left = bounds.left + 'px';
      dropLine.style.top = y + 'px';
      dropLine.style.width = bounds.width + 'px';
      dropLine.style.height = '';
      return;
    }
    const headers = thead.querySelectorAll('th.head-cell');
    if (headers.length === 0) {
      dropLine.hidden = true;
      return;
    }
    const edge =
      target >= headers.length
        ? headers[headers.length - 1].getBoundingClientRect().right
        : headers[Math.max(0, target)].getBoundingClientRect().left;
    dropLine.className = 'drop-line vertical';
    dropLine.style.left = edge + 'px';
    dropLine.style.top = bounds.top + 'px';
    dropLine.style.height = bounds.height + 'px';
    dropLine.style.width = '';
  }

  /** 隐藏落点指示线。 */
  function hideDropLine() {
    dropLine.hidden = true;
  }

  /**
   * 结束拖拽并清理临时状态。
   *
   * @returns {object|null} 结束前的拖拽状态。
   */
  function endDrag() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    const current = drag;
    drag = null;
    hideDropLine();
    document.body.classList.remove('dragging');
    if (current !== null) {
      markDragSource(current.kind, current.indices, false);
    }
    return current;
  }

  /**
   * 跟随指针更新落点指示。
   *
   * @param {MouseEvent} event - mousemove 事件。
   */
  function onDragMove(event) {
    if (drag === null) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const along = drag.kind === 'row' ? Math.abs(deltaY) : Math.abs(deltaX);
    const across = drag.kind === 'row' ? Math.abs(deltaX) : Math.abs(deltaY);
    if (!drag.active) {
      // 超过阈值、且主要沿行列方向移动时才算拖拽，单击仍然是单击。
      if (along < DRAG_THRESHOLD || along < across) {
        return;
      }
      drag.active = true;
      document.body.classList.add('dragging');
      markDragSource(drag.kind, drag.indices, true);
    }
    event.preventDefault();
    drag.target = dragTarget(event);
    if (drag.target === null) {
      hideDropLine();
    } else {
      showDropLine(drag.target);
    }
  }

  /** 松开鼠标：按落点移动选中的行列。 */
  function onDragEnd() {
    const current = endDrag();
    if (current === null || !current.active) {
      return;
    }
    // 拖动过就丢掉随后补发的 click，避免它把选区重置掉。
    suppressClick = true;
    if (current.target === null) {
      return;
    }
    const first = current.indices[0];
    const last = current.indices[current.indices.length - 1];
    // 落点仍落在原来的区间内，等于没有移动。
    if (current.target >= first && current.target <= last + 1) {
      return;
    }
    if (current.kind === 'row') {
      sendOp({ kind: 'moveRows', indices: current.indices, to: current.target });
    } else {
      // 列序变了，列宽按新顺序重新自适应。
      view.columnWidths = {};
      sendOp({ kind: 'moveColumns', indices: current.indices, to: current.target });
    }
  }

  /** 取消进行中的拖拽。 */
  function cancelDrag() {
    endDrag();
  }

  /* ------------------------------------------------------ 拖拽选中单元格区域 */

  /**
   * 按指针位置算出它下面的单元格。
   *
   * 优先用几何计算而不是 `elementFromPoint`：拖动过程中行会被重建，命中的节点
   * 可能是刚被替换掉的旧节点；而且指针移出表格（触发自动滚动）时几何计算仍然
   * 有效。
   *
   * @param {MouseEvent} event - mousemove 事件。
   * @returns {{row: number, col: number}|null} 行号是绝对行索引；不在表格上时为 `null`。
   */
  function cellAtPoint(event) {
    const width = scroll.clientWidth || 0;
    const height = scroll.clientHeight || 0;
    if (width > 0 && height > 0) {
      const bounds = scroll.getBoundingClientRect();
      const offsetY = event.clientY - bounds.top;
      const offsetX = event.clientX - bounds.left;
      if (offsetX >= 0 && offsetX <= width && offsetY >= 0 && offsetY <= height) {
        const rows = displayRows();
        const frozenRows = Math.min(view.frozenRows, rows.length);
        const frozenColumns = Math.min(view.frozenColumns, model.columnCount);
        const bodyTop = offsetY - HEAD_HEIGHT;
        if (bodyTop >= 0) {
          let index = -1;
          if (frozenRows > 0 && bodyTop < frozenRows * ROW_HEIGHT) {
            index = Math.floor(bodyTop / ROW_HEIGHT);
          } else if (bodyTop >= scroll.scrollTop + frozenRows * ROW_HEIGHT) {
            index = Math.floor((bodyTop - scroll.scrollTop) / ROW_HEIGHT);
          }
          if (index >= 0 && index < rows.length) {
            let column = -1;
            const bodyLeft = offsetX - ROWNUM_WIDTH;
            if (bodyLeft >= 0) {
              if (frozenColumns > 0 && bodyLeft < frozenColumns * DEFAULT_COLUMN_WIDTH) {
                // 锁定的列固定在左侧，不随横向滚动移动。
                let left = 0;
                for (let candidate = 0; candidate < frozenColumns; candidate += 1) {
                  left += columnWidth(candidate);
                  if (bodyLeft < left) {
                    column = candidate;
                    break;
                  }
                }
              } else {
                let left = 0;
                for (let candidate = 0; candidate < frozenColumns; candidate += 1) {
                  left += columnWidth(candidate);
                }
                const scrolled = bodyLeft - left + scroll.scrollLeft;
                let offset = 0;
                for (let candidate = frozenColumns; candidate < model.columnCount; candidate += 1) {
                  offset += columnWidth(candidate);
                  if (scrolled < offset) {
                    column = candidate;
                    break;
                  }
                }
              }
            }
            if (column >= 0 && column < model.columnCount) {
              return { row: rows[index], col: column };
            }
          }
        }
      }
    }
    if (typeof document.elementFromPoint !== 'function') {
      return null;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element && element.closest ? element.closest('td.cell') : null;
    if (cell === null) {
      return null;
    }
    return { row: Number(cell.getAttribute('data-row')), col: Number(cell.getAttribute('data-col')) };
  }

  /** 指针贴着表格边缘时自动滚动，便于拖拽到看不见的行列。 */
  function autoScrollFor(event) {
    const bounds = scroll.getBoundingClientRect();
    const edge = 24;
    if (event.clientY < bounds.top + edge) {
      scroll.scrollTop -= ROW_HEIGHT;
    } else if (event.clientY > bounds.bottom - edge) {
      scroll.scrollTop += ROW_HEIGHT;
    }
    if (event.clientX < bounds.left + edge) {
      scroll.scrollLeft -= DEFAULT_COLUMN_WIDTH;
    } else if (event.clientX > bounds.right - edge) {
      scroll.scrollLeft += DEFAULT_COLUMN_WIDTH;
    }
  }

  /**
   * 按下单元格：立刻选中它，并开始拖拽选区。
   *
   * @param {MouseEvent} event - mousedown 事件。
   * @param {number} row - 绝对行索引。
   * @param {number} column - 列索引。
   */
  function beginCellSelect(event, row, column) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    // 表格本身可聚焦，这样键盘与剪贴板事件不会落到别处。
    if (typeof scroll.focus === 'function') {
      scroll.focus();
    }
    selectCell(row, column, event.shiftKey);
    cellSelect = {
      anchor: view.selection.anchor,
      row: row,
      column: column,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      autoScroll: false,
      frame: null,
      lastEvent: event,
    };
    event.preventDefault();
    document.addEventListener('mousemove', onCellSelectMove);
    document.addEventListener('mouseup', onCellSelectEnd);
  }

  /**
   * 拖动过程中把选区扩展到指针所在的单元格。
   *
   * @param {MouseEvent} event - mousemove 事件。
   */
  function onCellSelectMove(event) {
    if (cellSelect === null) {
      return;
    }
    cellSelect.lastEvent = event;
    if (
      !cellSelect.active &&
      Math.abs(event.clientX - cellSelect.startX) < DRAG_THRESHOLD &&
      Math.abs(event.clientY - cellSelect.startY) < DRAG_THRESHOLD
    ) {
      return;
    }
    const inside =
      event.clientX >= 0 &&
      event.clientY >= 0 &&
      event.clientX <= (window.innerWidth || 0) &&
      event.clientY <= (window.innerHeight || 0);
    if (!inside) {
      // 指针移出窗口时由自动滚动继续扩展选区。
      cellSelect.autoScroll = true;
      if (cellSelect.frame === null) {
        cellSelect.frame = raf(autoScrollStep);
      }
      return;
    }
    cellSelect.active = true;
    extendCellSelection(event);
  }

  /** 自动滚动的一帧：滚动后按最近一次指针位置重新扩展选区。 */
  function autoScrollStep() {
    if (cellSelect === null) {
      return;
    }
    cellSelect.frame = null;
    if (cellSelect.autoScroll) {
      autoScrollFor(cellSelect.lastEvent);
      extendCellSelection(cellSelect.lastEvent);
      cellSelect.frame = raf(autoScrollStep);
    }
  }

  /**
   * 把选区扩展到指针位置。
   *
   * @param {MouseEvent} event - 指针事件。
   */
  function extendCellSelection(event) {
    const current = cellSelect;
    if (current === null) {
      return;
    }
    const target = cellAtPoint(event);
    if (target === null || (target.row === current.row && target.col === current.column)) {
      return;
    }
    current.row = target.row;
    current.column = target.col;
    view.selection = { anchor: current.anchor, focus: { row: target.row, col: target.col } };
    paintSelection();
    scrollIntoView(displayRows().indexOf(target.row));
    renderStatus();
  }

  /**
   * 结束单元格拖拽选区。
   *
   * @param {MouseEvent} event - mouseup 事件。
   */
  function onCellSelectEnd(event) {
    const current = cellSelect;
    if (current === null) {
      return;
    }
    // 收尾时指针可能已经离开窗口，这里再按最后一次位置补一次，保证选区完整。
    if (current.active) {
      extendCellSelection(event);
    }
    endCellSelect();
    if (current.active) {
      // 拖动过就丢掉随后补发的 click，避免它把选区重置成单个单元格。
      suppressClick = true;
    }
  }

  /** 清理单元格拖拽选区的临时状态。 */
  function endCellSelect() {
    document.removeEventListener('mousemove', onCellSelectMove);
    document.removeEventListener('mouseup', onCellSelectEnd);
    if (cellSelect !== null && cellSelect.frame !== null) {
      window.cancelAnimationFrame(cellSelect.frame);
    }
    cellSelect = null;
    paintSelection();
  }

  /** 绑定文档级的键盘与关闭处理函数。 */
  function wireDocument() {
    document.addEventListener('keydown', function (event) {
      const typing = isTypingTarget(event.target);

      if (event.key === 'Escape') {
        hideMenu();
        if (drag !== null) {
          cancelDrag();
          return;
        }
        if (cellSelect !== null) {
          endCellSelect();
          return;
        }
        if (!typing) {
          view.selection = null;
          paintSelection();
          renderStatus();
        }
        return;
      }
      if (typing) {
        return;
      }

      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        beginPaste();
        return;
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const rows = displayRows();
        if (rows.length > 0 && model.columnCount > 0) {
          view.selection = {
            anchor: { row: rows[0], col: 0 },
            focus: { row: rows[rows.length - 1], col: model.columnCount - 1 },
          };
          paintSelection();
          renderStatus();
        }
        return;
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        vscode.postMessage({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        vscode.postMessage({ type: 'redo' });
        return;
      }
      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        controls.search.focus();
        controls.search.select();
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        const focus = view.selection ? view.selection.focus : null;
        if (focus) {
          startEdit(focus.row, focus.col);
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const rect = selectionRect();
        if (!rect || model.readOnly) {
          return;
        }
        event.preventDefault();
        sendOp({
          kind: 'clearRange',
          rowStart: rect.r1,
          rowEnd: rect.r2,
          columnStart: rect.c1,
          columnEnd: rect.c2,
        });
        return;
      }

      const moves = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        Enter: [1, 0],
        Tab: [0, 1],
      };
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        const page = Math.max(1, Math.floor((scroll.clientHeight || 400) / ROW_HEIGHT) - 1);
        navigate(event.key === 'PageDown' ? page : -page, 0, event.shiftKey);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const rows = displayRows();
        if (rows.length === 0) {
          return;
        }
        const column = event.key === 'Home' ? 0 : model.columnCount - 1;
        const row = view.selection ? view.selection.focus.row : rows[0];
        view.selection = { anchor: { row: row, col: column }, focus: { row: row, col: column } };
        paintSelection();
        renderStatus();
        return;
      }
      if (Object.prototype.hasOwnProperty.call(moves, event.key)) {
        const delta = moves[event.key];
        let columnDelta = delta[1];
        let rowDelta = delta[0];
        if (event.key === 'Tab' && event.shiftKey) {
          columnDelta = -1;
        }
        if (event.key === 'Enter' && event.shiftKey) {
          rowDelta = -1;
        }
        event.preventDefault();
        navigate(rowDelta, columnDelta, event.shiftKey);
      }
    });

    document.addEventListener('paste', function (event) {
      if (isTypingTarget(event.target)) {
        // 就地编辑时让输入框自己处理粘贴。
        return;
      }
      if (handlePasteEvent(event)) {
        event.preventDefault();
      }
    });

    document.addEventListener('mousedown', function (event) {
      if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target)) {
        hideMenu();
      }
    });

    window.addEventListener('blur', hideMenu);
  }

  /* ---------------------------------------------------------------- 消息 */

  /**
   * 应用编辑器发来的完整更新。
   *
   * @param {object} message - 更新消息。
   */
  function applyUpdate(message) {
    const previousColumns = model.columnCount;
    const first = view.stateAdopted !== true;
    model.rows = Array.isArray(message.rows) ? message.rows : [];
    model.visible = Array.isArray(message.visible) ? message.visible : [];
    model.hasHeader = message.hasHeader === true;
    model.columnCount = message.columnCount || 0;
    model.totalRows = message.totalRows || 0;
    model.truncated = message.truncated === true;
    model.readOnly = message.readOnly === true;
    model.filterError = message.filterError || '';
    model.resolved =
      message.resolved && typeof message.resolved === 'object' ? message.resolved : {};
    model.formulaTargets =
      message.formulaTargets && typeof message.formulaTargets === 'object'
        ? message.formulaTargets
        : {};
    model.formulaErrors = Array.isArray(message.formulaErrors) ? message.formulaErrors : [];
    model.delimiter = message.delimiter || ',';
    model.detectedDelimiter = message.detectedDelimiter || model.delimiter;
    model.delimiterIsAuto = message.delimiterIsAuto !== false;
    model.columnWidthMax = message.columnWidthMax || MAX_COLUMN_WIDTH_DEFAULT;
    view.sort = message.sort || null;
    view.frozenRows = Number.isFinite(message.frozenRows) && message.frozenRows > 0 ? Math.floor(message.frozenRows) : 0;
    view.frozenColumns =
      Number.isFinite(message.frozenColumns) && message.frozenColumns > 0 ? Math.floor(message.frozenColumns) : 0;
    if (first) {
      // 后续更新不得覆盖用户正在输入的控件。
      adoptViewState(message.viewState);
      view.stateAdopted = true;
    } else if (model.columnCount !== previousColumns) {
      view.columnWidths = {};
    }
    constrainFreeze();
    constrainSelection();
    render();
    if (model.columnCount > 0 && Object.keys(view.columnWidths).length === 0) {
      autoFitAll();
    }
    // 「定位到引用表」打开这张表时，目标格随更新一起下来：渲染完就选中它。
    if (Array.isArray(message.revealCell) && message.revealCell.length === 2) {
      revealCell(Number(message.revealCell[0]), Number(message.revealCell[1]));
    }
  }

  /**
   * 从编辑器持久化的视图状态恢复视图控件。
   *
   * @param {object} state - 首次更新时随附的视图状态。
   */
  function adoptViewState(state) {
    if (!state || typeof state !== 'object') {
      return;
    }
    const filter = state.filter;
    if (filter && typeof filter === 'object') {
      view.filter = {
        query: typeof filter.query === 'string' ? filter.query : '',
        mode: typeof filter.mode === 'string' ? filter.mode : 'contains',
        caseSensitive: filter.caseSensitive === true,
        columns:
          filter.columns && typeof filter.columns === 'object' ? Object.assign({}, filter.columns) : {},
      };
      controls.search.value = view.filter.query;
    }
    view.header = state.header === 'yes' || state.header === 'no' ? state.header : 'auto';
    view.delimiter = typeof state.delimiter === 'string' ? state.delimiter : 'auto';
    view.columnWidths =
      state.columnWidths && typeof state.columnWidths === 'object'
        ? Object.assign({}, state.columnWidths)
        : {};
  }

  /** 使选区保持在视图当前持有的行内。 */
  function constrainSelection() {
    if (!view.selection) {
      return;
    }
    const rows = displayRows();
    if (rows.length === 0) {
      view.selection = null;
      return;
    }
    const clamp = function (position) {
      return {
        row: rows.indexOf(position.row) >= 0 ? position.row : rows[0],
        col: Math.min(Math.max(position.col, 0), Math.max(0, model.columnCount - 1)),
      };
    };
    view.selection = {
      anchor: clamp(view.selection.anchor),
      focus: clamp(view.selection.focus),
    };
  }

  /**
   * 应用一次行投影更新。
   *
   * @param {object} message - 视图消息。
   */
  function applyView(message) {
    model.visible = Array.isArray(message.visible) ? message.visible : [];
    model.hasHeader = message.hasHeader === true;
    model.totalRows = message.totalRows || 0;
    model.truncated = message.truncated === true;
    model.readOnly = message.readOnly === true;
    model.filterError = message.filterError || '';
    view.frozenRows = Number.isFinite(message.frozenRows) && message.frozenRows > 0 ? Math.floor(message.frozenRows) : 0;
    view.frozenColumns =
      Number.isFinite(message.frozenColumns) && message.frozenColumns > 0 ? Math.floor(message.frozenColumns) : 0;
    constrainFreeze();
    constrainSelection();
    render();
  }

  /** 开始监听来自编辑器的消息。 */
  function wireMessages() {
    window.addEventListener('message', function (event) {
      const message = event.data;
      if (!message || typeof message.type !== 'string') {
        return;
      }
      switch (message.type) {
        case 'update':
          applyUpdate(message);
          if (view.pendingRender) {
            view.pendingRender = false;
            renderBody();
          }
          break;
        case 'view':
          applyView(message);
          break;
        case 'reveal':
          revealCell(Number(message.row), Number(message.column));
          break;
        case 'toast':
          toast(message.message || '');
          break;
        case 'clipboardText':
          if (pasteTimer !== null) {
            window.clearTimeout(pasteTimer);
            pasteTimer = null;
          }
          pasteText(message.text === undefined || message.text === null ? '' : message.text);
          break;
        default:
          break;
      }
    });
  }

  /* ---------------------------------------------------------------- 初始化 */

  buildToolbar();
  wireGrid();
  wireDocument();
  wireMessages();
  render();
  window.addEventListener('resize', function () {
    applyColumnWidths();
    renderBody();
  });
  vscode.postMessage({ type: 'ready' });
})();
