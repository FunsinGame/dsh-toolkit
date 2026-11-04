/**
 * The toolbox catalogue.
 *
 * Each entry becomes one row in the sidebar and one pane in the content area.
 * Tools stay mounted while another tool is in front, so a loaded video or a
 * compared image pair survives a switch; `active` tells a tool whether it is
 * the visible one (pause videos, stop timers, release the keyboard).
 */

import type { ComponentType, ReactElement } from 'react'

import { CompareGlyph } from '../icons'
import { App as ImageCompareApp } from './image/App'
import { disposeImageState } from './image/store'
import { App as VideoPlayerApp } from './video/App'
import { PlayerEngine } from './video/engine'
import { VideoGlyph } from './video/icons'

export interface ToolProps {
  readonly active: boolean
}

export interface ToolDefinition {
  readonly id: string
  readonly name: string
  readonly summary: string
  /** Accent used by the sidebar tile when the tool is selected. */
  readonly accent: string
  readonly icon: (props: { size?: number }) => ReactElement
  readonly component: ComponentType<ToolProps>
}

let videoEngine: PlayerEngine | null = null

/** One engine for the life of the plugin: files, position and volume persist. */
export function getVideoEngine(): PlayerEngine {
  if (videoEngine === null) videoEngine = new PlayerEngine()
  return videoEngine
}

export function disposeVideoEngine(): void {
  if (videoEngine === null) return
  videoEngine.dispose()
  videoEngine = null
}

/** Release everything a tool holds when the plugin is deactivated. */
export function disposeToolbox(): void {
  disposeVideoEngine()
  disposeImageState()
}

function VideoTool({ active }: ToolProps): ReactElement {
  return <VideoPlayerApp engine={getVideoEngine()} active={active} />
}

function ImageTool({ active }: ToolProps): ReactElement {
  return <ImageCompareApp active={active} />
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'video',
    name: '视频逐帧播放器',
    summary: '逐帧检视 · 倒放 · 双画面对比',
    accent: '#4f8cff',
    icon: VideoGlyph,
    component: VideoTool,
  },
  {
    id: 'image',
    name: '图片对比',
    summary: '滑块 · 分割 · 淡化 · 闪烁 · 相减 · 高亮',
    accent: '#10b981',
    icon: CompareGlyph,
    component: ImageTool,
  },
]

export function findTool(id: string): ToolDefinition {
  return TOOLS.find((tool) => tool.id === id) ?? TOOLS[0]!
}

