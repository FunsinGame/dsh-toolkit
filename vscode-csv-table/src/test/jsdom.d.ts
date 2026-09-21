/**
 * jsdom 的最小类型声明。
 *
 * jsdom 不自带类型，而本包的 `tsconfig` 有意不引入 DOM 库，以免扩展宿主误用
 * 浏览器全局对象。webview 测试只需要这里声明的成员。
 */
declare module 'jsdom' {
  /** 解析后的文档，以及视图运行所在的 window。 */
  export class JSDOM {
    /**
     * 解析一个文档。
     *
     * @param html - 文档标记。
     * @param options - 测试使用的 jsdom 选项。
     */
    public constructor(
      html?: string,
      options?: {
        readonly runScripts?: string;
        readonly pretendToBeVisual?: boolean;
        readonly virtualConsole?: unknown;
      },
    );

    /** 承载该文档的 window。 */
    // 测试断言的是最终 DOM，因此这里取到的成员就是 jsdom 提供的样子，而不是
    // 一份建模出来的 API。
    public readonly window: any;
  }

  /** 吞掉 jsdom 的控制台输出，包括「未实现 canvas」之类的提示。 */
  export class VirtualConsole {}
}
