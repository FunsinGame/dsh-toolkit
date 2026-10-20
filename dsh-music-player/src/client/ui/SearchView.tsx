import React, { useEffect, useState } from 'react'
import { IconPlay, IconSearch, IconSparkles } from '../icons'
import type { PlayerController } from '../player'
import type { Track } from '../types'
import { AddFavoriteDialog } from './dialogs'
import { EmptyState, formatViews, SkeletonList, Spinner, TrackRow, useStore } from './common'

const SUGGESTIONS = ['久石让', '钢琴', '轻音乐', '爵士', '白噪音', '学习', '电影原声', '周杰伦']

export function SearchView({ controller }: { controller: PlayerController }): React.ReactElement {
  const library = useStore(controller.library)
  const player = useStore(controller.player)
  const search = library.search
  const [keyword, setKeyword] = useState(search?.keyword ?? '')
  const [favoriteTrack, setFavoriteTrack] = useState<Track | null>(null)

  useEffect(() => {
    if (search !== null && search.keyword !== keyword) setKeyword(search.keyword)
    // Only adopt a search initiated elsewhere (e.g. restored state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.keyword])

  const submit = (value = keyword): void => {
    const trimmed = value.trim()
    if (trimmed === '') return
    setKeyword(trimmed)
    void controller.search(trimmed, 1)
  }

  const isCurrent = (track: Track): boolean =>
    player.track !== null && player.track.bvid === track.bvid &&
    (track.cid === undefined || player.track.cid === undefined || player.track.cid === track.cid)

  return (
    <div className="dmp-fade-in">
      <section className="dmp-search-hero">
        <span className="dmp-search-kicker"><IconSparkles size={13} /> Bilibili Audio</span>
        <h3>把 B 站的声音，放进工作台</h3>
        <p>搜索视频、粘贴 BV 号，或直接从收藏夹开播。音频由宿主代理与缓存，切走页面也会继续播放。</p>
        <form
          className="dmp-search-box"
          onSubmit={(event) => { event.preventDefault(); submit() }}
        >
          <IconSearch size={18} />
          <input
            className="dmp-search-input"
            value={keyword}
            placeholder="搜索视频、音乐、UP 主，或粘贴 BV 号…"
            onChange={(event) => { setKeyword(event.target.value) }}
          />
          <button type="submit" className="dmp-search-btn" disabled={keyword.trim() === ''}>搜索</button>
        </form>
        <div className="dmp-chips">
          {SUGGESTIONS.map((item) => (
            <button type="button" className="dmp-chip" key={item} onClick={() => { submit(item) }}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {search !== null ? (
        <>
          <div className="dmp-section-head">
            <h4>{search.keyword}</h4>
            <span className="dmp-tag">{search.items.length} 个结果</span>
            <span className="dmp-caption">
              {search.loading ? '正在搜索…' : `第 ${search.page} / ${Math.max(1, search.numPages)} 页`}
            </span>
            <button
              type="button"
              className="dmp-btn sm"
              style={{ marginLeft: 'auto' }}
              disabled={search.items.length === 0}
              onClick={() => { controller.playSearchAll() }}
            >
              <IconPlay size={13} />
              播放全部
            </button>
          </div>
          {search.error !== null ? <div className="dmp-error">{search.error}</div> : null}
          {search.loading && search.items.length === 0 ? (
            <SkeletonList rows={7} />
          ) : search.items.length === 0 && !search.loading ? (
            <EmptyState
              icon={<IconSearch size={28} />}
              title="没有找到结果"
              description="换个关键词试试；如果 B 站触发了风控，稍等片刻或扫码登录后再搜。"
            />
          ) : (
            <div className="dmp-result-list">
              {search.items.map((track, index) => (
                <TrackRow
                  key={`${track.bvid}-${index}`}
                  track={track}
                  current={isCurrent(track)}
                  playing={player.playing}
                  onPlay={() => { controller.playSearchAt(index) }}
                  onEnqueue={() => { controller.enqueue(track) }}
                  onFavorite={() => { setFavoriteTrack(track) }}
                  trailing={track.views !== undefined && track.views > 0
                    ? <span className="dmp-caption" style={{ marginRight: 4 }}>{formatViews(track.views)} 播放</span>
                    : undefined}
                />
              ))}
            </div>
          )}
          {search.numPages > 1 ? (
            <div className="dmp-pager">
              <button
                type="button"
                className="dmp-btn sm"
                disabled={search.page <= 1 || search.loading}
                onClick={() => { void controller.search(search.keyword, search.page - 1) }}
              >
                上一页
              </button>
              <span>{search.page} / {search.numPages}</span>
              <button
                type="button"
                className="dmp-btn sm"
                disabled={search.page >= search.numPages || search.loading}
                onClick={() => { void controller.search(search.keyword, search.page + 1) }}
              >
                下一页
              </button>
              {search.loading ? <Spinner size={13} /> : null}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<IconSearch size={28} />}
          title="输入关键词开始搜索"
          description="支持关键词搜索与 BV 号直达。悬停结果可以快速加入队列或收藏。"
        />
      )}

      {favoriteTrack !== null ? (
        <AddFavoriteDialog controller={controller} track={favoriteTrack} onClose={() => { setFavoriteTrack(null) }} />
      ) : null}
    </div>
  )
}
