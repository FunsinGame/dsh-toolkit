/**
 * dsh-feishu-bot 手动联调脚本。
 *
 * 用于在接入 DSH 之前，先单独验证飞书侧配置是否正确（凭据、长连接、卡片、
 * 按钮回传、引用回复）。它直接用插件自己的连接层与卡片构建，不依赖 DSH 运行时。
 *
 * 用法：
 *   # 1) 第一次：拿自己的 open_id / chat_id
 *   DSH_FEISHU_APP_ID=cli_xxx DSH_FEISHU_APP_SECRET=xxx node scripts/smoke-feishu.mjs --bind
 *
 *   # 2) 发一张测试卡片并观察 60 秒内的事件
 *   DSH_FEISHU_APP_ID=cli_xxx DSH_FEISHU_APP_SECRET=xxx DSH_FEISHU_OPEN_ID=ou_xxx \
 *     node scripts/smoke-feishu.mjs
 *
 * 也可以不传环境变量：脚本会从 $DSH_HOME/feishu-bot/state.json 读取已绑定的
 * open_id/chat_id；app_secret 仍需要 DSH_FEISHU_APP_SECRET（或参数 --secret）。
 */
import process from 'node:process'
import { buildTestCard } from '../lib/cards.js'
import { FeishuBridge } from '../lib/bridge.js'
import { StateStore } from '../lib/store.js'

function argOf(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const appId = (argOf('--app-id') ?? process.env.DSH_FEISHU_APP_ID ?? '').trim()
const appSecret = (argOf('--secret') ?? process.env.DSH_FEISHU_APP_SECRET ?? '').trim()
const openId = (argOf('--open-id') ?? process.env.DSH_FEISHU_OPEN_ID ?? '').trim()
const chatId = (argOf('--chat-id') ?? process.env.DSH_FEISHU_CHAT_ID ?? '').trim()
const bindMode = process.argv.includes('--bind')
const seconds = Number(argOf('--seconds') ?? 60)

if (appId === '' || appSecret === '') {
  console.error('缺少 app_id / app_secret。请设置 DSH_FEISHU_APP_ID、DSH_FEISHU_APP_SECRET，或用 --app-id/--secret 传入。')
  process.exit(1)
}

const logger = {
  info: message => console.log(`[info] ${message}`),
  warn: message => console.warn(`[warn] ${message}`),
  error: message => console.error(`[error] ${message}`),
}

const bridge = new FeishuBridge({
  logger,
  onEvent: {
    message: async (payload) => {
      const message = payload?.message ?? {}
      const from = payload?.sender?.sender_id?.open_id
      console.log(`\n[message] from=${from} chat=${message.chat_id} type=${message.message_type} parent=${message.parent_id ?? '-'}`)
      try {
        console.log(`[message] content=${JSON.parse(message.content ?? '{}').text ?? '(非文本)'}`)
      } catch {
        console.log('[message] content=无法解析')
      }
      if (bindMode) {
        console.log('\n=== 绑定信息 ===')
        console.log(`DSH_FEISHU_OPEN_ID=${from ?? ''}`)
        console.log(`DSH_FEISHU_CHAT_ID=${message.chat_id ?? ''}`)
        console.log('================')
      }
      if (typeof message.message_id === 'string') {
        await bridge.replyText(message.message_id, '收到（dsh-feishu-bot smoke test）')
      }
    },
    cardAction: (payload) => {
      const value = payload?.action?.value
      console.log(`\n[card-action] message=${payload?.context?.open_message_id ?? '-'} value=${JSON.stringify(value)}`)
      return { toast: { type: 'success', content: 'smoke test 收到回调' } }
    },
  },
  onStatus: (status, error) => console.log(`[bridge] ${status}${error === '' || error === undefined ? '' : `: ${error}`}`),
})

const store = new StateStore()
store.load()
const binding = store.state.binding
const target = chatId !== '' ? chatId : (openId !== '' ? openId : (binding?.chatId ?? binding?.openId ?? ''))

try {
  await bridge.start({ appId, appSecret })
} catch (error) {
  console.error(`长连接失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

if (bindMode) {
  console.log('\n长连接已建立。请在飞书里给机器人随便发一条消息，脚本会打印你的 open_id / chat_id。')
} else {
  if (target === '') {
    console.error('没有可发送的目标：请传 DSH_FEISHU_OPEN_ID / DSH_FEISHU_CHAT_ID，或先用 --bind 绑定一次。')
    await bridge.stop()
    process.exit(1)
  }
  try {
    const messageId = await bridge.sendCard(target, buildTestCard({}))
    console.log(`\n已发送测试卡片：${messageId}（${seconds} 秒内等待按钮回调与消息）`)
  } catch (error) {
    console.error(`发送失败：${error instanceof Error ? error.message : String(error)}`)
    await bridge.stop()
    process.exit(1)
  }
}

const timer = setTimeout(async () => {
  console.log('\n时间到，关闭连接。')
  await bridge.stop()
  process.exit(0)
}, Math.max(5, seconds) * 1000)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    clearTimeout(timer)
    console.log('\n收到中断，关闭连接。')
    await bridge.stop()
    process.exit(0)
  })
}
