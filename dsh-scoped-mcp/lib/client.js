window.__ModuleLoader__.load({
  id: "dsh-scoped-mcp",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const h = React.createElement;

    // ── Remote descriptor schemas ─────────────────────────────────────────
    function loose(value) {
      return { parse(v) { return v; } };
    }
    const TYPERT_REMOTE = {
      package: "dsh-scoped-mcp",
      descriptors: [
        { id: "dsh-scoped-mcp#scopedMcpManager/list", service: "scopedMcpManager", namespace: "scopedMcpManager", method: "list", invocation: { kind: "direct" }, parameters: [{ name: "sessionId", wire: "sessionId", source: "json", acceptsUndefined: true, codec: { mode: "strict", typeSymbol: "SessionId", schema: loose() } }], result: { mode: "strict", typeSymbol: "ScopedMcpListResult", schema: loose() }, sourceLocation: { file: "lib/client.js", line: 1, column: 1 } },
        { id: "dsh-scoped-mcp#scopedMcpManager/save", service: "scopedMcpManager", namespace: "scopedMcpManager", method: "save", invocation: { kind: "direct" }, parameters: [{ name: "payload", wire: "payload", source: "json", codec: { mode: "strict", typeSymbol: "ScopedMcpSavePayload", schema: loose() } }], result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: loose() }, sourceLocation: { file: "lib/client.js", line: 1, column: 1 } },
        { id: "dsh-scoped-mcp#scopedMcpManager/removeServer", service: "scopedMcpManager", namespace: "scopedMcpManager", method: "removeServer", invocation: { kind: "direct" }, parameters: [{ name: "payload", wire: "payload", source: "json", codec: { mode: "strict", typeSymbol: "ScopedMcpRemovePayload", schema: loose() } }], result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: loose() }, sourceLocation: { file: "lib/client.js", line: 1, column: 1 } },
        { id: "dsh-scoped-mcp#scopedMcpManager/setEnabled", service: "scopedMcpManager", namespace: "scopedMcpManager", method: "setEnabled", invocation: { kind: "direct" }, parameters: [{ name: "payload", wire: "payload", source: "json", codec: { mode: "strict", typeSymbol: "ScopedMcpSetEnabledPayload", schema: loose() } }], result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: loose() }, sourceLocation: { file: "lib/client.js", line: 1, column: 1 } },
        { id: "dsh-scoped-mcp#scopedMcpManager/test", service: "scopedMcpManager", namespace: "scopedMcpManager", method: "test", invocation: { kind: "direct" }, parameters: [{ name: "payload", wire: "payload", source: "json", codec: { mode: "strict", typeSymbol: "ScopedMcpTestPayload", schema: loose() } }], result: { mode: "strict", typeSymbol: "ScopedMcpTestResult", schema: loose() }, sourceLocation: { file: "lib/client.js", line: 1, column: 1 } },
      ],
    };

    // ── Form helpers ──────────────────────────────────────────────────────
    const DEFAULT_FORM = () => ({
      serverName: "",
      transport: "stdio",
      command: "",
      argsText: "",
      envText: "",
      cwd: "",
      url: "",
      headersText: "",
      toolCallTimeoutMs: "60000",
      failOnStartupError: false,
      disabled: false,
    });

    function splitLines(text) {
      return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    function parsePairs(text) {
      const out = {};
      for (const line of splitLines(text)) {
        const index = line.indexOf("=");
        if (index <= 0) continue;
        const key = line.slice(0, index).trim();
        if (key) out[key] = line.slice(index + 1).trim();
      }
      return out;
    }

    function num(value, fallback) {
      const n = parseInt(String(value ?? ""), 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    function formFromServer(server) {
      const form = DEFAULT_FORM();
      form.serverName = server.serverName ?? "";
      form.transport = server.transport === "streamable-http" ? "streamable-http" : "stdio";
      form.command = server.command ?? "";
      form.argsText = Array.isArray(server.args) ? server.args.join("\n") : "";
      form.cwd = server.cwd ?? "";
      form.url = server.url ?? "";
      form.toolCallTimeoutMs = String(server.toolCallTimeoutMs ?? 60000);
      form.failOnStartupError = !!server.failOnStartupError;
      form.disabled = !!server.disabled;
      if (server.transport === "stdio") {
        form.envText = Object.entries(server.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");
      } else {
        form.headersText = Object.entries(server.headers ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");
      }
      return form;
    }

    function buildInput(form) {
      const common = {
        serverName: String(form.serverName ?? "").trim(),
        toolCallTimeoutMs: num(form.toolCallTimeoutMs, 60000),
        failOnStartupError: !!form.failOnStartupError,
        disabled: !!form.disabled,
      };
      if (form.transport === "streamable-http") {
        return {
          ...common,
          transport: "streamable-http",
          url: String(form.url ?? "").trim(),
          headers: parsePairs(form.headersText),
        };
      }
      return {
        ...common,
        transport: "stdio",
        command: String(form.command ?? "").trim(),
        args: splitLines(form.argsText),
        env: parsePairs(form.envText),
        cwd: String(form.cwd ?? "").trim(),
      };
    }

    const inputStyle = {
      boxSizing: "border-box", width: "100%", height: 32, font: "inherit", fontSize: 13,
      color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-layer-1)",
      border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "0 8px",
    };
    const textareaStyle = {
      boxSizing: "border-box", width: "100%", minHeight: 60, font: "inherit", fontSize: 12,
      color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-layer-1)",
      border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "6px 8px", resize: "vertical",
    };
    const labelStyle = { fontSize: 12, color: "var(--dsw-alias-label-secondary)", margin: 0 };
    const fieldStyle = { display: "flex", flexDirection: "column", gap: 5 };
    const buttonStyle = {
      font: "inherit", cursor: "pointer", background: "var(--dsw-alias-bg-layer-1)",
      border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "6px 12px", fontSize: 13,
    };

    function Field({ label, children, wide }) {
      return h("div", { style: { ...fieldStyle, ...(wide ? { gridColumn: "1 / -1" } : {}) } },
        h("label", { style: labelStyle }, label),
        children,
      );
    }

    // ── MCP settings form dialog ──────────────────────────────────────────
    function McpForm({ scopeLabel, initial, onSave, onCancel, onTest, busy, error }) {
      const [form, setForm] = React.useState(initial ? formFromServer(initial) : DEFAULT_FORM());
      const [testState, setTestState] = React.useState(null);
      const set = (key) => (event) => {
        const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
        setForm((prev) => ({ ...prev, [key]: value }));
      };
      const submit = () => {
        onSave(buildInput(form), initial?.serverName);
      };
      const test = async () => {
        setTestState({ kind: "testing" });
        try {
          const result = await onTest(buildInput(form));
          setTestState({ kind: "done", result });
        } catch (err) {
          setTestState({ kind: "done", result: { ok: false, error: String(err?.message ?? err), tools: [] } });
        }
      };
      return h("div", {
        style: {
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        },
      }, h("div", {
        style: {
          width: 640, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto",
          background: "var(--dsw-alias-bg-layer-3)", border: "1px solid var(--dsw-alias-border-l2)",
          borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10,
        },
      },
        h("div", { style: { fontSize: 15, fontWeight: 600 } }, initial ? `编辑 MCP 服务器（${scopeLabel}）` : `添加 MCP 服务器（${scopeLabel}）`),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
          h(Field, { label: "服务器名称", wide: true },
            h("input", { style: inputStyle, value: form.serverName, onChange: set("serverName") })),
          h(Field, { label: "传输方式" },
            h("select", { style: inputStyle, value: form.transport, onChange: set("transport") },
              h("option", { value: "stdio" }, "标准输入输出（STDIO）"),
              h("option", { value: "streamable-http" }, "HTTP"))),
          h(Field, { label: "调用超时（毫秒）" },
            h("input", { style: inputStyle, value: form.toolCallTimeoutMs, onChange: set("toolCallTimeoutMs") })),
          form.transport === "stdio"
            ? h(Field, { label: "命令", wide: true },
                h("input", { style: inputStyle, value: form.command, onChange: set("command") }))
            : h(Field, { label: "地址", wide: true },
                h("input", { style: inputStyle, value: form.url, onChange: set("url") })),
          form.transport === "stdio"
            ? h(Field, { label: "参数（每行一个）", wide: true },
                h("textarea", { style: textareaStyle, value: form.argsText, onChange: set("argsText") }))
            : null,
          form.transport === "stdio"
            ? h(Field, { label: "环境变量（每行 KEY=VALUE）", wide: true },
                h("textarea", { style: textareaStyle, value: form.envText, onChange: set("envText") }))
            : h(Field, { label: "请求头（每行 KEY=VALUE）", wide: true },
                h("textarea", { style: textareaStyle, value: form.headersText, onChange: set("headersText") })),
          form.transport === "stdio"
            ? h(Field, { label: "工作目录", wide: true },
                h("input", { style: inputStyle, value: form.cwd, onChange: set("cwd") }))
            : null,
          h(Field, { label: "启动失败即报错" },
            h("input", { type: "checkbox", checked: form.failOnStartupError, onChange: set("failOnStartupError") })),
          h(Field, { label: "禁用" },
            h("input", { type: "checkbox", checked: form.disabled, onChange: set("disabled") })),
        ),
        testState ? h("div", {
          style: {
            border: "1px solid " + (testState.result?.ok ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"),
            borderRadius: 8, padding: "8px 10px", fontSize: 12, whiteSpace: "pre-wrap",
          },
        }, testState.result?.ok
          ? `连接成功，共 ${testState.result.tools.length} 个工具：${testState.result.tools.map((tool) => tool.name).join(", ")}`
          : `连接失败：${testState.result?.error ?? ""}`) : null,
        error ? h("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 } }, String(error)) : null,
        h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" } },
          h("button", { type: "button", style: buttonStyle, onClick: test, disabled: busy || testState?.kind === "testing" },
            testState?.kind === "testing" ? "测试中…" : "测试连接"),
          h("button", { type: "button", style: buttonStyle, onClick: onCancel }, "取消"),
          h("button", { type: "button", style: { ...buttonStyle, background: "var(--dsw-alias-state-business-primary)", color: "#fff" }, onClick: submit, disabled: busy }, "保存"),
        ),
      ));
    }

    // ── Settings section ──────────────────────────────────────────────────
    function McpSettings({ list, save, remove, setEnabled, test, currentSessionId }) {
      const [data, setData] = React.useState(null);
      const [loadState, setLoadState] = React.useState({ kind: "loading" });
      const [tab, setTab] = React.useState("global");
      const [editing, setEditing] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [testing, setTesting] = React.useState(null);
      const [testResult, setTestResult] = React.useState(null);

      const load = React.useCallback(() => {
        setLoadState({ kind: "loading" });
        list(currentSessionId)
          .then((value) => {
            setData(value);
            setLoadState({ kind: "ready" });
          })
          .catch((err) => {
            setLoadState({ kind: "error", message: String(err?.message ?? err) });
          });
      }, [list, currentSessionId]);

      React.useEffect(() => { load(); }, [load]);

      const currentScope = data ? (tab === "global" ? data.global : data.workspace) : null;
      const servers = currentScope?.servers ?? [];
      const scopePath = tab === "global" ? "global" : data?.workspace?.path;
      const scopeLabel = tab === "global" ? "全局" : data?.workspace?.label ?? "工作区";

      const refresh = () => load();

      const applySave = async (input, previousServerName) => {
        setBusy(true);
        setError(null);
        try {
          await save({ sessionId: currentSessionId, scope: scopePath, server: input, previousServerName });
          setEditing(null);
          refresh();
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      };

      const applyToggle = async (server) => {
        try {
          await setEnabled({ sessionId: currentSessionId, scope: scopePath, serverName: server.serverName, enabled: server.disabled });
          refresh();
        } catch (err) {
          setError(String(err?.message ?? err));
        }
      };

      const applyRemove = async (server) => {
        if (!window.confirm(`确定删除 MCP 服务器“${server.serverName}”吗？`)) return;
        try {
          await remove({ sessionId: currentSessionId, scope: scopePath, serverName: server.serverName });
          refresh();
        } catch (err) {
          setError(String(err?.message ?? err));
        }
      };

      const applyTest = async (server) => {
        setTesting(server.serverName);
        setTestResult(null);
        try {
          const result = await test({ sessionId: currentSessionId, scope: scopePath, serverName: server.serverName });
          setTestResult({ serverName: server.serverName, result });
        } catch (err) {
          setTestResult({ serverName: server.serverName, result: { ok: false, error: String(err?.message ?? err), tools: [] } });
        } finally {
          setTesting(null);
        }
      };

      const formTest = async (input) => {
        return test({ sessionId: currentSessionId, scope: scopePath, server: input });
      };

      return h("div", { style: { width: "100%", maxWidth: 760, color: "var(--dsw-alias-label-primary)", display: "flex", flexDirection: "column", gap: 14 } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
          h("h3", { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, "MCP 服务器"),
          h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, "全局 + 工作区作用域的 MCP 配置"),
        ),
        h("div", { style: { display: "flex", gap: 6 } },
          h("button", { type: "button", style: { ...buttonStyle, ...(tab === "global" ? { borderColor: "var(--dsw-alias-state-business-primary)", color: "var(--dsw-alias-state-business-primary)" } : {}) }, onClick: () => { setTab("global"); setTestResult(null); } }, "全局"),
          data?.workspace ? h("button", { type: "button", style: { ...buttonStyle, ...(tab === "workspace" ? { borderColor: "var(--dsw-alias-state-business-primary)", color: "var(--dsw-alias-state-business-primary)" } : {}) }, onClick: () => { setTab("workspace"); setTestResult(null); } }, data.workspace.label ?? "工作区") : null,
          h("span", { style: { flex: 1 } }),
          h("button", { type: "button", style: buttonStyle, onClick: refresh }, "刷新"),
          h("button", { type: "button", style: { ...buttonStyle, borderStyle: "dashed" }, onClick: () => { setError(null); setEditing({ scope: scopePath }); } }, "+ 添加服务器"),
        ),
        loadState.kind === "error" ? h("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 } }, String(loadState.message)) : null,
        error ? h("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 } }, String(error)) : null,
        loadState.kind === "loading" && !data ? h("div", { style: { fontSize: 12 } }, "加载中…") : null,
        loadState.kind === "ready" && servers.length === 0 ? h("div", { style: { fontSize: 12 } }, "当前范围没有 MCP 服务器。") : null,
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 } },
          servers.map((server) => h("div", {
            key: server.serverName,
            style: {
              border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)",
              borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
            },
          },
            h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
              h("span", { style: { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, server.serverName),
              h("span", { style: { fontSize: 11, background: "var(--dsw-alias-bg-layer-1)", borderRadius: 5, padding: "1px 6px" } }, server.transport === "streamable-http" ? "HTTP" : "STDIO"),
              h("span", { style: { flex: 1 } }),
              h("span", { style: { fontSize: 11, color: server.disabled ? "var(--dsw-alias-label-tertiary)" : "var(--dsw-alias-state-success-primary)" } }, server.disabled ? "已禁用" : "已启用"),
            ),
            h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" } },
              server.transport === "stdio" ? server.command : server.url),
            testResult?.serverName === server.serverName ? h("div", {
              style: {
                border: "1px solid " + (testResult.result.ok ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"),
                borderRadius: 8, padding: "6px 8px", fontSize: 12,
              },
            }, testResult.result.ok
              ? `连接成功，共 ${testResult.result.tools.length} 个工具：${testResult.result.tools.map((tool) => tool.name).join(", ")}`
              : `连接失败：${testResult.result.error ?? ""}`) : null,
            h("div", { style: { display: "flex", gap: 6, borderTop: "1px solid var(--dsw-alias-border-l2)", paddingTop: 8 } },
              h("button", { type: "button", style: buttonStyle, onClick: () => applyToggle(server) }, server.disabled ? "启用" : "禁用"),
              h("button", { type: "button", style: buttonStyle, disabled: testing === server.serverName, onClick: () => applyTest(server) }, testing === server.serverName ? "测试中…" : "测试"),
              h("span", { style: { flex: 1 } }),
              h("button", { type: "button", style: buttonStyle, onClick: () => { setError(null); setEditing({ scope: scopePath, server }); } }, "编辑"),
              h("button", { type: "button", style: { ...buttonStyle, color: "var(--dsw-alias-state-error-primary)" }, onClick: () => applyRemove(server) }, "删除"),
            ),
          )),
        ),
        editing ? h(McpForm, {
          scopeLabel,
          initial: editing.server,
          onSave: applySave,
          onCancel: () => setEditing(null),
          onTest: formTest,
          busy,
          error,
        }) : null,
      );
    }

    // ── Plugin body ───────────────────────────────────────────────────────
    const inject = ["slots", "locale", "remote", "sessions"];

    async function apply(ctx) {
      const NS = "settings.mcpScoped";
      ctx.effect(() => ctx.locale.register(NS, {
        zh: { nav: "MCP", title: "MCP 服务器" },
        en: { nav: "MCP", title: "MCP Servers" },
      }), "dsh-scoped-mcp: dictionaries");

      const mount = ctx.remote.$mount(TYPERT_REMOTE);
      const currentSessionId = () => ctx.get("sessions").currentProvideInfo.getSnapshot().sessionId;
      async function call(method, ...args) {
        await mount;
        const remote = ctx.get("remote.scopedMcpManager");
        if (!remote) throw new Error("scopedMcpManager remote not available");
        const result = await remote[method](...args);
        if (!result.ok) throw new Error(result.error?.message ?? result.error?.code ?? "scopedMcpManager call failed");
        return result.value;
      }

      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-scoped-mcp",
        order: 16.6,
        label: () => "MCP",
        locale: NS,
        inject: () => ({
          list: (sessionId) => call("list", sessionId),
          save: (payload) => call("save", payload),
          remove: (payload) => call("removeServer", payload),
          setEnabled: (payload) => call("setEnabled", payload),
          test: (payload) => call("test", payload),
          currentSessionId: currentSessionId(),
        }),
      }, McpSettings));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
