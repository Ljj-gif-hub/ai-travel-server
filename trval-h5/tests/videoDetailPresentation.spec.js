// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { replace, getToken, likeNote, getAllNotes, getComments, showToast, getFollowing, follow, unfollow, addComment } = vi.hoisted(() => ({
  getFollowing: vi.fn(async () => ({ code: 0, data: [] })),
  follow: vi.fn(async () => ({ code: 0 })),
  unfollow: vi.fn(async () => ({ code: 0 })),
  addComment: vi.fn(async () => ({ code: 0, data: { id: 99, content: 'hello' } })),
  replace: vi.fn(),
  getToken: vi.fn(() => 'test-session'),
  likeNote: vi.fn(async () => ({ code: 0, data: { isLiked: true, likes: 1 } })),
  getAllNotes: vi.fn(),
  getComments: vi.fn(async () => ({ code: 0, data: [] })),
  showToast: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
  useRoute: () => ({ path: '/video-detail', query: { id: '6' } }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key }) }))
vi.mock('../src/utils/auth', () => ({ getToken }))
vi.mock('vant', async () => ({ ...(await vi.importActual('vant')), showToast }))
vi.mock('../src/api', () => ({
  noteApi: { getAllNotes, likeNote },
  followApi: { getFollowing, follow, unfollow },
  commentApi: {
    getComments,
    getReplies: vi.fn(async () => ({ code: 0, data: [] })),
    addComment,
    deleteComment: vi.fn(),
    likeComment: vi.fn(),
  },
}))
vi.mock('../src/components/CollectionSheet.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/components/ReportSheet.vue', () => ({ default: { render: () => null } }))

import VideoDetailView from '../src/views/VideoDetailView.vue'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const makeNotes = () => [{
  id: 6,
  title: '雨夜外滩漫步',
  userId: 9,
  authorName: '旅行摄影师',
  authorCity: '上海',
  content: '雨后的外滩像一场流动电影。<video src="https://cdn.example/a.mp4"></video>',
  tags: ['上海', '夜景'],
  views: 58,
  likes: 12,
  comments: 3,
  isLiked: false,
}, {
  id: 7,
  title: '西湖日落路线',
  userId: 2,
  authorName: '远方',
  content: '<video src="https://cdn.example/b.mp4"></video>',
  tags: ['杭州'],
  views: 21,
  likes: 4,
  comments: 1,
  isLiked: false,
}]

let app
let host

beforeEach(() => {
  getComments.mockResolvedValue({ code: 0, data: [] })
  getToken.mockReturnValue('test-session')
  getFollowing.mockResolvedValue({ code: 0, data: [] })
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  HTMLMediaElement.prototype.pause = () => {}
  HTMLMediaElement.prototype.load = () => {}
})

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})

const mount = async (notes = makeNotes()) => {
  getAllNotes.mockResolvedValue({ code: 0, data: { list: notes, hasMore: false } })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(VideoDetailView)
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector('.video-shell')).toBeTruthy())
  await nextTick()
}

const touch = (element, type, clientY) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY }] })
  element.dispatchEvent(event)
}

it('使用全屏竖滑视频流与三段式底部评论抽屉', () => {
  const src = read('../src/views/VideoDetailView.vue')
  expect(src).toContain('video-neighbor-prev')
  expect(src).toContain('video-neighbor-next')
  expect(src).toContain('onVideoTouchStart')
  expect(src).toContain('DRAWER_HEIGHTS = [0, 62, 82, 100]')
  expect(src).toContain('drawer-backdrop')
  expect(src).toContain('drawer-slide-enter-from')
})

it('渲染大标题、统计、标签、简介和相关推荐', async () => {
  await mount()
  expect(host.querySelector('.video-title').textContent).toBe('雨夜外滩漫步')
  expect(host.querySelector('.video-stats').textContent).toContain('58')
  expect(host.querySelectorAll('.video-tag')).toHaveLength(2)
  expect(host.querySelector('.b-desc').textContent).toBe('雨后的外滩像一场流动电影。')
  expect(host.querySelector('.related-card').textContent).toContain('西湖日落路线')
  expect(host.querySelector('.avatar-fallback').textContent).toBe('旅')
})

it('横版视频完整显示并提供横向观看入口', async () => {
  await mount()
  const video = host.querySelector('.full-video')
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
  video.dispatchEvent(new Event('loadedmetadata'))
  await nextTick()
  expect(host.querySelector('.video-shell').classList.contains('landscape')).toBe(true)
  expect(host.querySelector('.video-current').classList.contains('landscape')).toBe(true)
  expect(host.querySelector('.landscape-watch-btn').textContent).toContain('community.landscapeWatch')
  expect(read('../src/views/VideoDetailView.vue')).toContain('.video-current.landscape .full-video { object-fit:contain; }')
})

it('进度条可拖动并同步视频播放位置', async () => {
  await mount()
  const video = host.querySelector('.full-video')
  Object.defineProperty(video, 'duration', { configurable: true, value: 200 })
  video.dispatchEvent(new Event('loadedmetadata'))
  const progress = host.querySelector('.video-progress-range')
  progress.value = '25'
  progress.dispatchEvent(new Event('input', { bubbles: true }))
  expect(video.currentTime).toBe(50)
  expect(progress.type).toBe('range')
})

it('上滑下一条、下滑上一条', async () => {
  await mount()
  const zone = host.querySelector('.video-zone')
  touch(zone, 'touchstart', 560)
  touch(zone, 'touchmove', 260)
  touch(zone, 'touchend', 260)
  await vi.waitFor(() => expect(host.querySelector('.video-title').textContent).toBe('西湖日落路线'))
  await new Promise(resolve => setTimeout(resolve, 420))

  touch(zone, 'touchstart', 260)
  touch(zone, 'touchmove', 560)
  touch(zone, 'touchend', 560)
  await vi.waitFor(() => expect(host.querySelector('.video-title').textContent).toBe('雨夜外滩漫步'))
})

it('点击相关推荐在当前全屏流内切换', async () => {
  await mount()
  host.querySelector('.related-card').click()
  await vi.waitFor(() => expect(host.querySelector('.video-title').textContent).toBe('西湖日落路线'))
  host.querySelector('.comment-action').click()
  await nextTick()
  expect(getComments).toHaveBeenCalledWith(7, 0, 20)
  expect(replace).toHaveBeenCalledWith({ path: '/video-detail', query: { id: '7' } })
})

it('评论抽屉从底部打开、上拉扩展，并由遮罩平滑关闭', async () => {
  await mount()
  host.querySelector('.comment-action').click()
  await nextTick()
  expect(host.querySelector('.comment-drawer').style.height).toBe('62dvh')
  expect(host.querySelector('.drawer-backdrop')).toBeTruthy()

  const grabber = host.querySelector('.drawer-grabber')
  touch(grabber, 'touchstart', 520)
  touch(grabber, 'touchmove', 300)
  touch(grabber, 'touchend', 300)
  await nextTick()
  expect(host.querySelector('.comment-drawer').style.height).toBe('82dvh')

  host.querySelector('.drawer-backdrop').click()
  await new Promise(resolve => setTimeout(resolve, 320))
  expect(host.querySelector('.comment-drawer')).toBeNull()
})

it('评论抽屉打开后仍保留原评论与回复入口', async () => {
  getComments.mockResolvedValue({
    code: 0,
    data: [{ id: 11, userId: 4, authorName: '同路人', content: '收藏路线了', date: '刚刚', replyCount: 0, likes: 2 }],
  })
  await mount()
  host.querySelector('.comment-action').click()
  await vi.waitFor(() => expect(getComments).toHaveBeenCalledWith(6, 0, 20))
  await nextTick()
  expect(host.querySelector('.cmt-txt').textContent).toBe('收藏路线了')
  expect(host.querySelectorAll('.cmt-action')[1].textContent).toContain('community.reply')
  expect(host.querySelector('.dr-input')).toBeTruthy()
})


it('声音和倍速直接控制播放器，切换视频清空旧进度', async () => {
  await mount()
  const video = host.querySelector('.full-video')
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 })
  video.currentTime = 60
  video.dispatchEvent(new Event('timeupdate'))
  host.querySelector('.mute-button').click()
  const speed = host.querySelector('.speed-select')
  speed.value = '2'
  speed.dispatchEvent(new Event('change'))
  await nextTick()
  expect(video.muted).toBe(false)
  expect(video.playbackRate).toBe(2)
  expect(host.querySelector('.video-progress-range').value).toBe('50')
  host.querySelector('.related-card').click()
  await nextTick()
  expect(host.querySelector('.video-progress-range').value).toBe('0')
  expect(host.querySelector('.video-time-tt').textContent).toBe('0:00 / 0:00')
})

it('点赞去重，旧视频点赞响应不会覆盖新视频状态', async () => {
  let resolveLike
  likeNote.mockImplementationOnce(() => new Promise(resolve => { resolveLike = resolve }))
  await mount()
  host.querySelector('.like-action').click()
  host.querySelector('.like-action').click()
  expect(likeNote).toHaveBeenCalledTimes(1)
  host.querySelector('.related-card').click()
  await nextTick()
  resolveLike({ code: 0, data: { isLiked: true, likes: 13 } })
  await nextTick()
  expect(host.querySelector('.like-action').getAttribute('aria-pressed')).toBe('false')
  expect(host.querySelector('.like-action').textContent).toContain('4')
})

it('双击点赞使用真实接口，已赞视频双击不会取消点赞', async () => {
  await mount()
  const zone = host.querySelector('.video-zone')
  zone.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await nextTick()
  expect(likeNote).toHaveBeenCalledWith(6)
  zone.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await nextTick()
  expect(likeNote).toHaveBeenCalledTimes(1)
})

it('关注状态从接口恢复，点击可取消关注', async () => {
  getFollowing.mockResolvedValueOnce({ code: 0, data: [{ id: 9 }] })
  await mount()
  expect(host.querySelector('.follow-chip').textContent).toBe('community.followed')
  host.querySelector('.follow-chip').click()
  await nextTick()
  expect(unfollow).toHaveBeenCalledWith('9')
  await vi.waitFor(() => expect(host.querySelector('.follow-chip').getAttribute('aria-pressed')).toBe('false'))
})

it('播放错误展示重试，点击重试重新加载媒体', async () => {
  await mount()
  HTMLMediaElement.prototype.load = vi.fn()
  host.querySelector('.full-video').dispatchEvent(new Event('error'))
  await nextTick()
  expect(host.querySelector('.playback-error')).toBeTruthy()
  host.querySelector('.playback-error button').click()
  await nextTick()
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)
  expect(host.querySelector('.playback-error')).toBeNull()
})

it('评论加载失败显示重试，不误显示暂无评论', async () => {
  getComments.mockRejectedValueOnce(new Error('offline'))
  await mount()
  host.querySelector('.comment-action').click()
  await vi.waitFor(() => expect(host.querySelector('.no-cmt').textContent).toContain('community.commentsLoadFailed'))
  host.querySelector('.no-cmt button').click()
  await vi.waitFor(() => expect(host.querySelector('.no-cmt').textContent).toContain('community.noComments'))
})

it('空视频流显示返回社区入口', async () => {
  getAllNotes.mockResolvedValueOnce({ code: 0, data: { list: [], hasMore: false } })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(VideoDetailView)
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector('.video-loading h1')).toBeTruthy())
  expect(host.querySelector('.video-shell')).toBeNull()
})
