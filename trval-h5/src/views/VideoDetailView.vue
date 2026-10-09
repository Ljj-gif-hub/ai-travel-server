<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { showToast } from 'vant';
import { getToken } from '../utils/auth';
import { noteApi, commentApi, followApi } from '../api';
import ReportSheet from '../components/ReportSheet.vue';
import CollectionSheet from '../components/CollectionSheet.vue';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const goBack = () => window.history.state?.back ? router.back() : router.push('/community');

const notes = ref([]);
const currentIdx = ref(0);
const isLoading = ref(true);
const loadFailed = ref(false);
const videoFailed = ref(false);
const buffering = ref(true);
const muted = ref(true);
const playbackRate = ref(1);
const descriptionExpanded = ref(false);
const showMore = ref(false);
const showShare = ref(false);
const showSearch = ref(false);
const showCollectionSheet = ref(false);
const searchInput = ref('');
const searchResults = ref([]);
const searching = ref(false);
const searchFailed = ref(false);
const searchSubmitted = ref(false);
const followingIds = ref([]);
const followingReady = ref(false);
const followPending = ref(false);
const likePending = ref(false);
const sending = ref(false);
const commentsLoading = ref(false);
const commentsFailed = ref(false);
const commentsPage = ref(0);
const commentsHasMore = ref(false);
const feedPage = ref(1);
const feedHasMore = ref(false);
const feedLoading = ref(false);
let searchSeq = 0;
let clickTimer;
let disposed = false;
const isLiked = ref(false);
const likeCount = ref(0);
const commentCount = ref(0);
const commentInput = ref('');
const comments = ref([]);
// ===== 回复功能（抖音风格） =====
const expandedReplies = reactive({});   // { commentId: true/false } 是否已展开回复
const replyList = reactive({});         // { commentId: [reply, ...] } 缓存已加载的回复
const replyShowCount = reactive({});    // { commentId: number } 每次展开5条
const replyInputs = reactive({});       // { commentId: 'text' } 回复输入框文字
const replyTarget = ref(null);          // { id, authorName, rootId } 当前正在回复的评论
const isPlaying = ref(true);
const videoRef = ref(null);
const videoCurrentTime = ref(0);
const videoDuration = ref(0);
const videoProgress = ref(0);       // 0~100
const isFullscreen = ref(false);
const isLandscapeVideo = ref(false);
const landscapeButtonTop = ref('auto');
const updateLandscapeButton = () => {
  const video = videoRef.value;
  const zone = video?.closest('.video-zone');
  if (!video?.videoWidth || !zone) return;
  const rect = video.getBoundingClientRect();
  const mediaHeight = Math.min(rect.height, rect.width * video.videoHeight / video.videoWidth);
  landscapeButtonTop.value = `${rect.top - zone.getBoundingClientRect().top + (rect.height + mediaHeight) / 2 + 12}px`;
};
// BUGID 修复：当前登录用户 id（从 JWT payload 解析），用于评论/回复删除权限判定
const currentUserId = ref(null);
// BUGID 修复：评论请求序号守卫，切换视频后旧请求结果直接丢弃
let commentsReqSeq = 0;

const onVideoTimeUpdate = () => {
  if (!videoRef.value) return
  videoCurrentTime.value = videoRef.value.currentTime
  videoDuration.value = videoRef.value.duration || 0
  videoProgress.value = videoDuration.value ? (videoCurrentTime.value / videoDuration.value) * 100 : 0
};

const onVideoLoadedMetadata = () => {
  if (videoRef.value) {
    videoDuration.value = videoRef.value.duration || 0
    const { videoWidth, videoHeight } = videoRef.value
    isLandscapeVideo.value = videoWidth > videoHeight
    nextTick(updateLandscapeButton);
    videoRef.value.playbackRate = playbackRate.value
    // BUGID 修复：play() 可能被浏览器自动播放策略拒绝，失败时保持 isPlaying=false
    videoRef.value.play().then(() => { isPlaying.value = true }).catch(() => { isPlaying.value = false })
  }
};

const seekVideo = (e) => {
  const pct = Number(e.currentTarget.value)
  if (videoRef.value && videoDuration.value) {
    videoRef.value.currentTime = (pct / 100) * videoDuration.value
    videoCurrentTime.value = videoRef.value.currentTime
    videoProgress.value = pct
  }
};

// 全屏按钮的 fixed 坐标

const toggleFullscreen = async () => {
  try {
    if (isFullscreen.value) {
      if (document.fullscreenElement) await document.exitFullscreen()
      screen.orientation?.unlock?.()
      isFullscreen.value = false
      return
    }

    const el = videoRef.value?.closest('.video-zone')
    if (el?.requestFullscreen) await el.requestFullscreen()
    else if (el?.webkitRequestFullscreen) await el.webkitRequestFullscreen()
    else if (videoRef.value?.webkitEnterFullscreen) {
      videoRef.value.webkitEnterFullscreen()
      return
    } else throw new Error('fullscreen unsupported')

    isFullscreen.value = true
    if (isLandscapeVideo.value) {
      try { await screen.orientation?.lock?.('landscape') } catch {}
    }
    videoRef.value?.play().catch(() => {})
  } catch {
    isFullscreen.value = false
    showToast(t('community.fullscreenFailed'))
  }
};

// 监听原生全屏变化
const onFullscreenChange = () => {
  if (!document.fullscreenElement && isFullscreen.value) {
    isFullscreen.value = false
    nextTick(updateLandscapeButton);
  }
}
document.addEventListener('fullscreenchange', onFullscreenChange)
document.addEventListener('webkitfullscreenchange', onFullscreenChange)
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
})

const formatTime = (s) => {
  if (!s || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m + ':' + String(sec).padStart(2, '0')
};


// ===== 视频滑动（抖音风格跟手拖拽） =====
const videoDragY = ref(0);          // 当前拖拽偏移量(px)
const isVideoDragging = ref(false); // 手指按下中
const videoSnapping = ref(false);   // 松手回弹/吸附动画中
const showSwipeHint = ref(true);    // 上滑提示，几秒后自动消失
const touchStartY = ref(0);
const suppressVideoClick = ref(false);
const isTransitioning = ref(false);
const heartBurst = ref(false);

// ===== 抽屉状态 =====
const drawerLevel = ref(0);       // 0=关闭, 1=半屏, 2=大部分, 3=全屏(视频隐藏)
const dragOffset = ref(0);
const dragStartY = ref(0);
const dragging = ref(false);

// 三段式底部抽屉：首开不压满视频，上拉可查看更多评论。
const DRAWER_HEIGHTS = [0, 62, 82, 100];

const closeDrawer = () => { drawerLevel.value = 0; dragOffset.value = 0; };
const openDrawer = () => {
  drawerLevel.value = 1; dragOffset.value = 0;
  if (!comments.value.length && !commentsLoading.value) loadComments();
};

// 抽屉是否可见
const drawerVisible = computed(() => drawerLevel.value > 0);
const drawerStyle = computed(() => {
  // 关闭时仍保留首段高度，让 Transition 从当前位置完整滑出。
  const base = DRAWER_HEIGHTS[drawerLevel.value || 1];
  const offset = dragging.value ? (dragOffset.value / window.innerHeight) * 100 : 0;
  return { height: `${Math.max(24, Math.min(100, base - offset))}dvh` };
});

// 拖拽
const onDragStart = (e) => {
  dragging.value = true;
  dragStartY.value = e.touches[0].clientY;
};
const onDragMove = (e) => {
  if (!dragging.value) return;
  dragOffset.value = e.touches[0].clientY - dragStartY.value;
};
const onDragEnd = () => {
  if (!dragging.value) return;
  dragging.value = false;
  const vh = window.innerHeight;
  const ratio = (dragOffset.value / vh) * 100;
  if (ratio > 8) {
    // 下拉 → 降一级
    if (drawerLevel.value <= 1) closeDrawer();
    else drawerLevel.value -= 1;
  } else if (ratio < -8) {
    // 上拉 → 升一级
    drawerLevel.value = Math.min(3, drawerLevel.value + 1);
  }
  dragOffset.value = 0;
};

const current = computed(() => notes.value[currentIdx.value] || {});
const authorId = computed(() => current.value.userId || current.value.authorId);
const isFollowing = computed(() => followingIds.value.includes(String(authorId.value)));
const canFollow = computed(() => authorId.value && String(authorId.value) !== String(currentUserId.value));
const shareUrl = computed(() => `${window.location.origin}${window.location.pathname}#/video-detail?id=${encodeURIComponent(current.value.id || '')}`);
const description = computed(() => stripHtml(current.value.content));
const modalOpen = computed(() => drawerVisible.value || showMore.value || showShare.value || showSearch.value || showReportSheet.value || showCollectionSheet.value);
const authorInitial = computed(() => String(current.value.authorName || t('community.traveler')).trim().charAt(0).toUpperCase());
const relatedVideos = computed(() => notes.value
  .map((note, index) => ({ note, index }))
  .filter(item => item.index !== currentIdx.value)
  .slice(0, 3));
const displayTags = computed(() => Array.isArray(current.value.tags) ? current.value.tags : []);
const extractVideoUrl = (note) => {
  if (!note) return '';
  if (note.cover && /\.(mp4|webm|mov)([?#]|$)/i.test(note.cover)) return note.cover;
  if (note.content) {
    const m = note.content.match(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return '';
};
const videoUrl = computed(() => extractVideoUrl(current.value));

const loadVideos = async () => {
  const startId = route.query.id;
  isLoading.value = true;
  loadFailed.value = false;
  try {
    // 【修复】视频广场应加载所有用户的视频游记，而非仅当前用户
    const res = await noteApi.getAllNotes(1, 20, { media: 'video' });
    if (res?.code !== 0) throw new Error('feed unavailable');
    if (res?.code === 0 && res.data) {
      // 兼容旧数组结构 与 新分页结构 { list, total, hasMore }
      const all = Array.isArray(res.data) ? res.data : (res.data.list || []);
      const withVideo = all.filter(n => extractVideoUrl(n));
      if (startId && !withVideo.some(n => String(n.id) === String(startId))) {
        const detail = await noteApi.getNoteDetail(startId);
        if (detail?.code === 0 && extractVideoUrl(detail.data)) withVideo.unshift(detail.data);
        else showToast(t('community.videoUnavailable'));
      }
      notes.value = withVideo;
      feedPage.value = 1;
      feedHasMore.value = Boolean(res.data.hasMore);
      const idx = withVideo.findIndex(n => String(n.id) === String(startId));
      currentIdx.value = idx >= 0 ? idx : 0;
    }
  } catch { loadFailed.value = true; }
  finally {
    isLoading.value = false;
    updateState();
    await nextTick();
    // 上滑提示 3 秒后自动消失
    showSwipeHint.value = notes.value.length > 1;
    if (showSwipeHint.value) {
      setTimeout(() => { showSwipeHint.value = false; }, 3000);
    }
  }
};

const updateState = () => {
  const n = current.value; if (!n) return;
  isLiked.value = n.isLiked || false;
  likeCount.value = n.likes || n.likeCount || 0;
  commentCount.value = n.comments || n.commentCount || 0;
  videoCurrentTime.value = 0;
  videoDuration.value = 0;
  videoProgress.value = 0;
  videoFailed.value = false;
  buffering.value = true;
  isPlaying.value = false;
  descriptionExpanded.value = false;
};

// BUGID 修复：从 JWT payload 解析当前用户 id（与 NoteDetailView 一致）
const parseUserId = () => {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));
    return decoded.userId || null;
  } catch { return null }
};

const loadComments = async (append = false) => {
  const id = current.value?.id; if (!id) return;
  // BUGID 修复：自增序号守卫，切换视频后旧请求返回时直接丢弃，避免旧请求覆盖新视频评论
  const reqSeq = ++commentsReqSeq;
  const page = append ? commentsPage.value + 1 : 0;
  commentsLoading.value = true;
  commentsFailed.value = false;
  try {
    const res = await commentApi.getComments(id, page, 20);
    if (reqSeq !== commentsReqSeq) return;
    if (res.code !== 0) throw new Error('comments unavailable');
    if (res.code === 0) {
      const list = Array.isArray(res.data) ? res.data : [];
      comments.value = append ? [...comments.value, ...list.filter(c => !comments.value.some(old => old.id === c.id))] : list;
      commentsPage.value = page;
      commentsHasMore.value = list.length === 20;
    }
  } catch { if (reqSeq === commentsReqSeq) commentsFailed.value = true; }
  finally { if (reqSeq === commentsReqSeq) commentsLoading.value = false; }
};

const goToVideo = async (idx) => {
  if (idx < 0 || idx >= notes.value.length || isTransitioning.value) return;
  isTransitioning.value = true;
  currentIdx.value = idx;
  clearTimeout(clickTimer);
  isLandscapeVideo.value = false;
  closeDrawer();
  // BUGID 修复：切换视频前递增序号，立即使仍在途的旧评论请求失效
  commentsReqSeq++;
  comments.value = [];
  commentsLoading.value = false;
  commentsFailed.value = false;
  commentsHasMore.value = false;
  // 清理回复状态
  Object.keys(expandedReplies).forEach(k => delete expandedReplies[k]);
  Object.keys(replyList).forEach(k => delete replyList[k]);
  Object.keys(replyInputs).forEach(k => delete replyInputs[k]);
  replyTarget.value = null;
  commentInput.value = '';
  updateState();
  router.replace({ path: '/video-detail', query: { id: String(current.value.id) } });
  await nextTick();
  if (videoRef.value) {
    videoRef.value.load();
    // BUGID 修复：play() 可能被浏览器拦截，仅在成功后置 isPlaying，失败时保持暂停态
    videoRef.value.play().then(() => { isPlaying.value = true }).catch(() => { isPlaying.value = false });
  }
  setTimeout(() => { isTransitioning.value = false; }, 400);
};

const nextVideo = async () => {
  if (feedLoading.value || isTransitioning.value) return;
  if (currentIdx.value < notes.value.length - 1) return goToVideo(currentIdx.value + 1);
  if (!feedHasMore.value) { showToast(t('community.noMoreVideos')); return; }
  feedLoading.value = true;
  try {
    const res = await noteApi.getAllNotes(feedPage.value + 1, 20, { media: 'video' });
    if (res?.code !== 0) throw new Error();
    const list = Array.isArray(res.data) ? res.data : res.data.list || [];
    notes.value.push(...list.filter(n => extractVideoUrl(n) && !notes.value.some(old => old.id === n.id)));
    feedPage.value++;
    feedHasMore.value = Boolean(res.data.hasMore);
    if (currentIdx.value < notes.value.length - 1) goToVideo(currentIdx.value + 1);
  } catch { showToast(t('community.networkErrorRetry')); }
  finally { feedLoading.value = false; }
};

// ===== 抖音风格视频滑动 =====
const onVideoTouchStart = (e) => {
  if (modalOpen.value || isTransitioning.value || isFullscreen.value) return;
  isVideoDragging.value = true;
  videoSnapping.value = false;
  touchStartY.value = e.touches[0].clientY;
};
const onVideoTouchMove = (e) => {
  if (!isVideoDragging.value) return;
  let delta = e.touches[0].clientY - touchStartY.value;
  if (Math.abs(delta) > 8) suppressVideoClick.value = true;
  // 边界阻力：首条下拉 / 末条上拉
  if ((currentIdx.value === 0 && delta > 0) || (currentIdx.value === notes.value.length - 1 && !feedHasMore.value && delta < 0)) {
    delta = delta * 0.28;
  }
  videoDragY.value = delta;
};
const onVideoTouchEnd = () => {
  if (!isVideoDragging.value) return;
  isVideoDragging.value = false;
  const delta = videoDragY.value;
  if (delta < -80 && currentIdx.value === notes.value.length - 1 && feedHasMore.value) nextVideo();
  const threshold = window.innerHeight * 0.22;
  if (suppressVideoClick.value) setTimeout(() => { suppressVideoClick.value = false; }, 350);

  if (Math.abs(delta) > threshold) {
    // 吸附到下一个/上一个视频
    const dir = delta < 0 ? 1 : -1; // 负=上滑=下一条
    const targetIdx = currentIdx.value + dir;
    if (targetIdx >= 0 && targetIdx < notes.value.length) {
      showSwipeHint.value = false; // 用户已会滑动，隐藏提示
      videoDragY.value = dir > 0 ? -window.innerHeight : window.innerHeight;
      videoSnapping.value = true;
      setTimeout(() => {
        if (disposed) return;
        videoDragY.value = 0;
        videoSnapping.value = false;
        goToVideo(targetIdx);
      }, 220);
      return;
    }
  }
  // 回弹
  videoSnapping.value = true;
  videoDragY.value = 0;
  setTimeout(() => { videoSnapping.value = false; }, 280);
};

const handleLike = async () => {
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (likePending.value) return;
  const note = notes.value[currentIdx.value];
  if (!note) return;
  likePending.value = true;
  const prevLiked = note.isLiked;
  const prevLikes = note.likes || 0;
  // 乐观更新：本地 ref + 源数据同步
  note.isLiked = !note.isLiked;
  note.likes = note.isLiked ? prevLikes + 1 : Math.max(0, prevLikes - 1);
  isLiked.value = note.isLiked;
  likeCount.value = note.likes;
  try {
    const res = await noteApi.likeNote(note.id);
    if (res.code === 0) {
      note.isLiked = res.data.isLiked;
      note.likes = res.data.likes;
      if (current.value.id === note.id) {
        isLiked.value = note.isLiked;
        likeCount.value = note.likes;
      }
    } else throw new Error();
  } catch {
    note.isLiked = prevLiked;
    note.likes = prevLikes;
    if (current.value.id === note.id) {
      isLiked.value = prevLiked;
      likeCount.value = prevLikes;
    }
    showToast(t('community.opFailedRetry'));
  } finally { likePending.value = false; }
};

const togglePlay = () => {
  if (!videoRef.value) return;
  if (isPlaying.value) {
    videoRef.value.pause();
  } else {
    // BUGID 修复：play() 可能被浏览器拦截，失败时保持暂停态不置 true
    videoRef.value.play().then(() => { isPlaying.value = true }).catch(() => { isPlaying.value = false });
  }
};

// 点击视频区：抽屉打开时关闭抽屉，否则暂停/播放
const onVideoClick = () => {
  if (suppressVideoClick.value) return;
  if (drawerVisible.value) {
    closeDrawer();
  } else {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(togglePlay, 240);
  }
};

const handleSendComment = async () => {
  const text = commentInput.value.trim();
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (!text || sending.value) return;
  const note = current.value;
  sending.value = true;
  try {
    const res = await commentApi.addComment(note.id, text);
    if (res.code !== 0) throw new Error();
    note.comments = (note.comments || 0) + 1;
    if (current.value.id !== note.id) return;
    if (res.code === 0) {
      comments.value.unshift({ ...res.data, replyCount: 0 });
      commentCount.value++;
      // 同步到源数据
      commentInput.value = '';
      showToast(t('community.commentSuccess'));
    }
  } catch { showToast(t('community.commentFailed')); }
  finally { sending.value = false; }
};

const handleSendReply = async () => {
  if (!replyTarget.value) return
  const { id, rootId, authorName } = replyTarget.value
  const text = (replyInputs[rootId] || '').trim()
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (!text || sending.value) return;
  const note = current.value;
  sending.value = true;
  try {
    // 回复到顶层父评论下，内容前加 @mention
    const content = id !== rootId ? `@${authorName} ${text}` : text
    const res = await commentApi.addComment(note.id, content, null, null, rootId)
    if (res.code !== 0) throw new Error();
    note.comments = (note.comments || 0) + 1;
    if (current.value.id !== note.id) return;
    if (res.code === 0) {
      const reply = res.data
      const parent = comments.value.find(c => c.id === rootId)
      if (parent) {
        parent.replyCount = (parent.replyCount || 0) + 1
        if (!parent.topReply) parent.topReply = reply
      }
      if (expandedReplies[rootId] && replyList[rootId]) {
        replyList[rootId].push(reply)
      }
      commentCount.value++
      replyInputs[rootId] = ''
      replyTarget.value = null
      showToast(t('community.replySuccess'))
    }
  } catch { showToast(t('community.replyFailed')); }
  finally { sending.value = false; }
};

const toggleReplies = async (commentId) => {
  if (expandedReplies[commentId]) {
    // 收起
    expandedReplies[commentId] = false;
    delete replyShowCount[commentId];
  } else {
    // 展开：懒加载回复列表
    const noteId = current.value.id;
    try {
      const res = await commentApi.getReplies(commentId);
      if (current.value.id !== noteId) return;
      if (res.code === 0) {
        replyList[commentId] = res.data || [];
        replyShowCount[commentId] = 5;
        expandedReplies[commentId] = true;
      }
    } catch { showToast(t('community.loadRepliesFailed')); }
  }
};

const startReply = (comment) => {
  // 找到顶层父评论ID（回复回复时，归属到顶层评论区）
  const rootId = comment.parentId || comment.id
  replyTarget.value = {
    id: comment.id,
    rootId,
    authorName: comment.authorName || (t('community.user') + (comment.userId || ''))
  }
  // 确保展开该顶层评论的回复区
  if (!expandedReplies[rootId] && comment.parentId) {
    toggleReplies(rootId)
  }
  nextTick(() => {
    const input = document.querySelector('.dr-input-row.replying input');
    if (input) input.focus();
  });
};

const cancelReply = () => {
  replyTarget.value = null;
};

const handleDeleteComment = async (c) => {
  try {
    const res = await commentApi.deleteComment(c.id);
    if (res.code !== 0) { showToast(res.message || t('community.deleteFailed')); return; }
    // 判断是顶级评论还是回复
    const isTopLevel = !c.parentId;
    if (isTopLevel) {
      comments.value = comments.value.filter(x => x.id !== c.id);
      commentCount.value = Math.max(0, commentCount.value - 1);
      // 清理关联的回复缓存
      delete expandedReplies[c.id];
      delete replyList[c.id];
    } else {
      // 从回复列表中移除
      const parentId = c.parentId;
      if (replyList[parentId]) {
        replyList[parentId] = replyList[parentId].filter(r => r.id !== c.id);
      }
      // 更新父评论的回复计数
      const parent = comments.value.find(x => x.id === parentId);
      if (parent) {
        parent.replyCount = Math.max(0, (parent.replyCount || 1) - 1);
        const remaining = replyList[parentId] || [];
        parent.topReply = remaining.length > 0 ? remaining[0] : null;
      }
      // 回复也计入总评论数，删除时同步减少
      commentCount.value = Math.max(0, commentCount.value - 1);
      const note = notes.value[currentIdx.value];
      if (note) note.comments = Math.max(0, (note.comments || 1) - 1);
    }
  } catch { showToast(t('community.deleteFailed')); }
};

const handleLikeComment = async (c) => {
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  try {
    const res = await commentApi.likeComment(c.id);
    if (res.code === 0) {
      c.likes = res.data.likes;
      // 如果是回复，同步更新父评论的 topReply 预览
      if (c.parentId) {
        const parent = comments.value.find(x => x.id === c.parentId);
        if (parent && parent.topReply && parent.topReply.id === c.id) {
          parent.topReply.likes = res.data.likes;
        }
      }
    }
  } catch { /* ignore */ }
};
const doubleLike = () => {
  clearTimeout(clickTimer);
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (!isLiked.value) handleLike();
  heartBurst.value = true;
  setTimeout(() => { heartBurst.value = false; }, 800);
};

const loadFollowing = async () => {
  if (!getToken()) return;
  try {
    const res = await followApi.getFollowing();
    if (res.code !== 0) throw new Error();
    followingIds.value = (res.data || []).map(user => String(user.id));
    followingReady.value = true;
  } catch { followingReady.value = false; }
};
const handleFollow = async () => {
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (followPending.value || !canFollow.value) return;
  const id = String(authorId.value);
  followPending.value = true;
  try {
    if (!followingReady.value) await loadFollowing();
    if (!followingReady.value) throw new Error();
    const followed = followingIds.value.includes(id);
    const res = await (followed ? followApi.unfollow(id) : followApi.follow(id));
    if (res.code !== 0) throw new Error();
    followingIds.value = followed ? followingIds.value.filter(value => value !== id) : [...followingIds.value, id];
  } catch { showToast(t('community.opFailedRetry')); }
  finally { followPending.value = false; }
};
const openCollection = () => {
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  showCollectionSheet.value = true;
};
const copyLink = async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareUrl.value);
    else {
      const field = document.querySelector('.share-link');
      field?.focus(); field?.select();
      if (!document.execCommand('copy')) throw new Error();
    }
    showToast(t('community.linkCopied'));
  } catch { showToast(t('community.manualCopy')); }
};
const systemShare = async () => {
  try { await navigator.share({ title: current.value.title, url: shareUrl.value }); }
  catch (error) { if (error.name !== 'AbortError') showToast(t('community.shareFailed')); }
};
const canSystemShare = Boolean(navigator.share);
const retryVideo = () => {
  videoFailed.value = false; buffering.value = true;
  videoRef.value?.load();
  videoRef.value?.play().catch(() => { isPlaying.value = false; buffering.value = false; });
};
const setPlaybackRate = (event) => {
  playbackRate.value = Number(event.target.value);
  if (videoRef.value) videoRef.value.playbackRate = playbackRate.value;
};
const searchVideos = async () => {
  if (!searchInput.value.trim()) return;
  const seq = ++searchSeq;
  searching.value = true; searchFailed.value = false; searchSubmitted.value = true;
  try {
    const res = await noteApi.getAllNotes(1, 50, { media: 'video', q: searchInput.value.trim() });
    if (seq !== searchSeq) return;
    if (res.code !== 0) throw new Error();
    searchResults.value = (Array.isArray(res.data) ? res.data : res.data.list || []).filter(extractVideoUrl);
  } catch { if (seq === searchSeq) searchFailed.value = true; }
  finally { if (seq === searchSeq) searching.value = false; }
};
const selectSearchResult = (note) => {
  let idx = notes.value.findIndex(item => item.id === note.id);
  if (idx < 0) { notes.value.push(note); idx = notes.value.length - 1; }
  showSearch.value = false;
  goToVideo(idx);
};
const onKeydown = (event) => {
  if (event.key === 'Escape') {
    closeDrawer(); showMore.value = false; showShare.value = false; showSearch.value = false;
    showCollectionSheet.value = false; showReportSheet.value = false;
    return;
  }
  if (event.target.closest?.('input, textarea, select, button, [contenteditable="true"]') || modalOpen.value || !notes.value.length) return;
  if ([' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  if (event.key === ' ') togglePlay();
  if (event.key === 'ArrowDown') nextVideo();
  if (event.key === 'ArrowUp') goToVideo(currentIdx.value - 1);
  if (event.key.toLowerCase() === 'm') muted.value = !muted.value;
  if (videoRef.value && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    videoRef.value.currentTime = Math.max(0, Math.min(videoDuration.value, videoCurrentTime.value + (event.key === 'ArrowRight' ? 5 : -5)));
  }
};
const onVisibilityChange = () => { if (document.hidden) videoRef.value?.pause(); };

/* ==================== 举报（新功能） ==================== */
const showReportSheet = ref(false);
const openReport = () => {
  if (!getToken()) { showToast(t('common.notLoggedIn')); return; }
  if (!current.value?.id) return;
  showReportSheet.value = true;
};
const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<img[^>]*>/gi,'[图片]').replace(/<(?:video|source)[^>]*\/?>/gi,'').replace(/<[^>]+>/g,'').trim();
};

onMounted(() => {
  window.addEventListener('resize', updateLandscapeButton);
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  // BUGID 修复：解析当前登录用户 id，用于评论/回复删除权限校验
  currentUserId.value = parseUserId();
  loadVideos();
  loadFollowing();
});
onUnmounted(() => {
  disposed = true; commentsReqSeq++; searchSeq++;
  window.removeEventListener('resize', updateLandscapeButton);
  clearTimeout(clickTimer);
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (videoRef.value) videoRef.value.pause();
});

watch(() => route.query.id, (id) => {
  const idx = notes.value.findIndex(note => String(note.id) === String(id));
  if (idx >= 0 && idx !== currentIdx.value) goToVideo(idx);
});
</script>

<template>
  <div class="video-page-root">
  <div class="video-shell" :class="{ dragging, fullscreen: isFullscreen, landscape: isLandscapeVideo }" v-if="!isLoading && notes.length && !loadFailed">
      <!-- 顶部栏 -->
      <div class="top-bar">
        <div class="top-brand"><button type="button" class="top-icon" :aria-label="t('common.back')" @click.stop="goBack"><van-icon name="arrow-left" size="22"/></button><span class="brand-mark"><van-icon name="video"/> {{ t('community.videoWorld') }}</span></div>
        <div class="feed-heading"><span class="active-feed">{{ t('community.discoverVideos') }}</span><span class="feed-subtitle">{{ t('community.videoTagline') }}</span></div>
        <button type="button" class="search-entry" :aria-label="t('community.searchVideos')" @click.stop="showSearch = true"><van-icon name="search" size="20"/><span>{{ t('community.searchVideos') }}</span></button>
      </div>

      <!-- ══════ 视频区 ══════ -->
      <div class="video-zone" @click="onVideoClick" @dblclick.stop="doubleLike" @touchstart="onVideoTouchStart" @touchmove.prevent="onVideoTouchMove" @touchend="onVideoTouchEnd" @touchcancel="isVideoDragging = false; videoDragY = 0">
        <div class="video-track" :class="{ snapping: videoSnapping, dragging: isVideoDragging }" :style="{ transform: `translateY(${videoDragY}px)` }">
          <div v-if="currentIdx > 0" class="video-neighbor video-neighbor-prev" aria-hidden="true">
            <video :src="extractVideoUrl(notes[currentIdx - 1])" muted playsinline preload="metadata"></video>
          </div>
          <div class="video-current" :class="{ landscape: isLandscapeVideo }">
            <video
              v-if="videoUrl" :key="current.id" ref="videoRef" :src="videoUrl" class="full-video" loop playsinline :muted="muted"
              webkit-playsinline autoplay
              :aria-label="current.title" preload="metadata"
              @waiting="buffering = true" @canplay="buffering = false" @playing="buffering = false"
              @error="videoFailed = true; buffering = false; isPlaying = false"
              @loadedmetadata="onVideoLoadedMetadata"
              @timeupdate="onVideoTimeUpdate"
              @pause="isPlaying=false" @play="isPlaying=true"
              @webkitbeginfullscreen="isFullscreen=true" @webkitendfullscreen="isFullscreen=false"
            ></video>
            <div v-else :key="'empty-'+currentIdx" class="no-video"><van-icon name="video-o" size="60" color="rgba(255,255,255,0.3)"/><p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:14px">{{ t('community.noVideo') }}</p></div>
          </div>
          <div v-if="currentIdx < notes.length - 1" class="video-neighbor video-neighbor-next" aria-hidden="true">
            <video :src="extractVideoUrl(notes[currentIdx + 1])" muted playsinline preload="metadata"></video>
          </div>
        </div>
        <!-- 播放/暂停指示 -->
        <div v-if="!videoFailed" class="play-indicator" :class="{ hide: isPlaying }"><van-icon name="play" size="52"/></div>
        <div v-if="buffering && !videoFailed" class="buffer-indicator" role="status"><van-loading size="22" color="#fff"/>{{ t('community.authorVideosLoading') }}</div>
        <div v-if="videoFailed" class="playback-error" role="alert" @click.stop><van-icon name="warning-o" size="36"/><p>{{ t('community.videoUnavailable') }}</p><button type="button" @click="retryVideo">{{ t('community.retryPlay') }}</button></div>
        <div v-if="heartBurst" class="heart-burst">❤️</div>
        <div class="swipe-hint" v-if="showSwipeHint && currentIdx<notes.length-1 && !drawerVisible"><van-icon name="arrow-up" size="16" color="rgba(255,255,255,0.5)"/><span>{{ t('community.swipeNext') }}</span></div>
        <!-- 全屏按钮（视频右下角，进度条上方） -->
        <button v-if="isLandscapeVideo && !isFullscreen" type="button" class="landscape-watch-btn" :style="{ top: landscapeButtonTop }" @click.stop="toggleFullscreen">
          <van-icon name="exchange" size="16"/> {{ t('community.landscapeWatch') }}
        </button>
        <!-- 抖音风底部进度条 -->
        <div class="video-controls" @click.stop @dblclick.stop @touchstart.stop @touchmove.stop @touchend.stop>
          <input type="range" class="video-progress-range" min="0" max="100" step="0.1"
            :value="videoProgress" :disabled="!videoDuration || videoFailed" :style="{ '--progress': videoProgress + '%' }"
            :aria-label="t('community.videoProgress')" @input="seekVideo" @click.stop
            @touchstart.stop @touchmove.stop @touchend.stop>
          <div class="video-bottom-row">
            <button type="button" class="player-button" :aria-label="t(isPlaying ? 'community.pause' : 'community.play')" @click="togglePlay"><van-icon :name="isPlaying ? 'pause' : 'play'" size="18"/></button>
            <span class="video-time-tt">{{ formatTime(videoCurrentTime) }} / {{ formatTime(videoDuration) }}</span>
            <div class="player-options">
              <button type="button" class="player-button mute-button" :aria-label="t(muted ? 'community.unmute' : 'community.mute')" :aria-pressed="!muted" @click="muted = !muted"><van-icon :name="muted ? 'volume-o' : 'volume'" size="19"/><span>{{ t(muted ? 'community.unmute' : 'community.mute') }}</span></button>
              <select class="speed-select" :aria-label="t('community.playbackSpeed')" :value="playbackRate" @change="setPlaybackRate"><option v-for="rate in [0.5, 1, 1.5, 2]" :key="rate" :value="rate">{{ rate }}×</option></select>
              <button type="button" class="player-button fullscreen-btn" :aria-label="t(isFullscreen ? 'community.exitFullscreen' : 'community.fullscreen')" @click="toggleFullscreen"><van-icon :name="isFullscreen ? 'shrink' : 'expand-o'" size="19"/></button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧操作（独立于视频区，被抽屉遮挡） -->
      <div class="side-layer" :class="{ under: drawerVisible, snapping: videoSnapping, dragging: isVideoDragging }" :style="{ transform: `translateY(${videoDragY}px)` }">
        <div class="side-actions">
          <div class="side-avatar-ring">
            <van-image v-if="current.authorAvatar" round width="44" height="44" :src="current.authorAvatar" fit="cover"/>
            <span v-else class="avatar-fallback">{{ authorInitial }}</span>
          </div>
          <button type="button" class="side-btn like-action" :aria-label="t('community.like')" :aria-pressed="isLiked" :disabled="likePending" @click.stop="handleLike">
            <van-icon name="like" size="30" :color="isLiked?'#ff4567':'#fff'"/><span class="side-num">{{ likeCount || t('community.like') }}</span>
          </button>
          <button type="button" class="side-btn comment-action" :aria-label="t('community.commentsTab')" :aria-expanded="drawerVisible" @click.stop="drawerVisible ? closeDrawer() : openDrawer()">
            <van-icon name="chat" size="32" color="#fff"/><span class="side-num">{{ commentCount }}</span>
          </button>
          <button type="button" class="side-btn" :aria-label="t('collection.saveToCollection')" @click.stop="openCollection"><van-icon name="star" size="29"/><span class="side-num">{{ t('community.favorite') }}</span></button>
          <button type="button" class="side-btn" :aria-label="t('community.share')" @click.stop="showShare = true">
            <van-icon name="share" size="30" color="#fff"/><span class="side-num">{{ t('community.share') }}</span>
          </button>
          <button type="button" class="side-btn more-action" :aria-label="t('community.moreActions')" @click.stop="showMore = true"><van-icon name="ellipsis" size="26"/></button>
        </div>
        <div class="bottom-info">
          <div class="info-eyebrow"><span class="live-dot"/> {{ t('community.travelMoment') }}<span>{{ String(currentIdx + 1).padStart(2, '0') }}</span></div>
          <div class="bottom-author"><span class="b-name">@{{ current.authorName || t('community.traveler') }}</span><button v-if="canFollow" type="button" class="follow-chip" :class="{ followed: isFollowing }" :disabled="followPending" :aria-pressed="isFollowing" @click="handleFollow">{{ t(isFollowing ? 'community.followed' : 'community.follow') }}</button></div>
          <h1 class="video-title">{{ current.title || t('community.video') }}</h1>
          <div class="video-stats">
            <span><van-icon name="eye-o"/> {{ current.views || 0 }} {{ t('community.viewsUnit') }}</span>
            <span v-if="current.date">{{ current.date }}</span>
          </div>
          <div v-if="displayTags.length" class="video-tags">
            <span v-for="tag in displayTags" :key="tag" class="video-tag">#{{ tag }}</span>
          </div>
          <div v-if="description" class="b-desc" :class="{ expanded: descriptionExpanded }">{{ description }}</div>
          <button v-if="description.length > 64" type="button" class="description-toggle" :aria-expanded="descriptionExpanded" @click="descriptionExpanded = !descriptionExpanded">{{ t(descriptionExpanded ? 'community.collapseDescription' : 'community.expandDescription') }}</button>
          <div class="location-chip" v-if="current.authorCity||current.city"><van-icon name="location-o" size="11"/><span>{{ current.authorCity||current.city }}</span></div>
          <div v-if="relatedVideos.length" class="related-strip">
            <span class="related-label">{{ t('community.relatedVideos') }}</span>
            <button v-for="item in relatedVideos" :key="item.note.id" type="button" class="related-card" @click.stop="goToVideo(item.index)">
              <span class="related-thumb"><van-icon name="play" size="18"/></span>
              <span class="related-copy"><strong>{{ item.note.title || t('community.video') }}</strong><small>{{ item.note.authorName || t('community.traveler') }} · {{ item.note.views || 0 }} {{ t('community.viewsUnit') }}</small></span><van-icon name="arrow" size="12"/>
            </button>
          </div>
          <button type="button" class="note-link" @click="router.push({ path: '/note-detail', query: { id: current.id } })">{{ t('community.viewNote') }}<van-icon name="arrow"/></button>
        </div>
      </div>

      <div class="feed-navigation"><button type="button" :aria-label="t('community.previousVideo')" :disabled="currentIdx === 0 || isTransitioning" @click="goToVideo(currentIdx - 1)"><van-icon name="arrow-up"/></button><span>{{ currentIdx + 1 }} / {{ notes.length }}{{ feedHasMore ? '+' : '' }}</span><button type="button" :aria-label="t('community.nextVideo')" :disabled="(!feedHasMore && currentIdx === notes.length - 1) || feedLoading || isTransitioning" @click="nextVideo"><van-icon name="arrow-down"/></button></div>
      <div class="watch-footer"><button type="button" class="comment-launcher" @click="openDrawer"><van-icon name="edit"/><span>{{ t('community.friendlyComment') }}</span><span class="comment-count">{{ commentCount }}<van-icon name="chat-o"/></span></button><span class="keyboard-hint">{{ t('community.keyboardHint') }}</span></div>

      <!-- ══════ 评论抽屉 ══════ -->
      <Transition name="drawer-fade">
        <div v-if="drawerVisible" class="drawer-backdrop" @click="closeDrawer"/>
      </Transition>
      <Transition name="drawer-slide">
        <div class="comment-drawer" v-if="drawerVisible" role="dialog" :aria-label="t('community.commentsTab')"
          :class="{ dragging, full: drawerLevel === 3 }" :style="drawerStyle"
        >
        <div class="drawer-grabber" @touchstart.stop="onDragStart" @touchmove.stop.prevent="onDragMove" @touchend.stop="onDragEnd" @touchcancel.stop="onDragEnd">
          <div class="handle-row"><div class="handle-bar"/></div>
          <div class="dr-header">
            <span class="dr-title">{{ t('community.commentCount', { n: commentCount }) }}</span>
            <button type="button" class="close-panel" :aria-label="t('common.close')" @click.stop="closeDrawer"><van-icon name="cross" size="18"/></button>
          </div>
        </div>
        <!-- 列表 -->
        <div class="dr-list">
          <div v-if="commentsFailed" class="no-cmt" role="alert"><p>{{ t('community.commentsLoadFailed') }}</p><button type="button" @click="loadComments(comments.length > 0)">{{ t('community.retryPlay') }}</button></div>
          <div v-else-if="!commentsLoading && comments.length===0" class="no-cmt"><van-icon name="chat-o" size="40"/><p>{{ t('community.noComments') }}</p><small>{{ t('community.commentPrompt') }}</small></div>
          <div v-for="c in comments" :key="c.id" class="cmt-row">
            <van-image round width="32" height="32" fit="cover" class="cmt-av" :src="c.authorAvatar||''"/>
            <div class="cmt-main">
              <div class="cmt-head">
                <span class="cmt-author-name">{{ c.authorName || (t('community.user') + c.userId) }}</span>
                <span class="cmt-tm">{{ c.date }}</span>
              </div>
              <div class="cmt-txt">{{ c.content }}</div>
              <img v-if="c.image" :src="c.image" class="cmt-img" loading="lazy" />
              <video v-if="c.video" :src="c.video" controls class="cmt-vid"/>

              <!-- ══════ 底部操作行：点赞 + 回复 ══════ -->
              <div class="cmt-actions-row">
                <span class="cmt-action" @click.stop="handleLikeComment(c)">
                  <van-icon name="good-job-o" size="14" /> {{ c.likes || '' }}
                </span>
                <span class="cmt-action" @click.stop="startReply(c)">{{ t('community.reply') }}</span>
              </div>

              <!-- ══════ 回复区域 ══════ -->
              <div v-if="c.replyCount > 0" class="reply-zone">
                <!-- 未展开：预览 → 展开按钮在下方 -->
                <template v-if="!expandedReplies[c.id]">
                  <div v-if="c.topReply" class="reply-preview">
                    <span class="reply-preview-author">{{ c.topReply.authorName || (t('community.user') + c.topReply.userId) }}</span>
                    <span v-if="c.topReply.content" class="reply-preview-text">：{{ c.topReply.content }}</span>
                    <img v-if="c.topReply.image" :src="c.topReply.image" class="cmt-img" style="max-width:80px"/>
                  </div>
                  <div class="reply-toggle" @click.stop="toggleReplies(c.id)">
                    <span class="reply-toggle-line"></span>
                    <span>{{ t('community.expandReplies', { n: c.replyCount }) }} <van-icon name="arrow-down" size="10" /></span>
                  </div>
                </template>

                <!-- 展开后：回复列表 → 收起按钮在下面 -->
                <template v-else>
                  <div class="reply-list">
                    <div v-for="r in (replyList[c.id]||[]).slice(0, replyShowCount[c.id] || 5)" :key="r.id" class="reply-item">
                      <van-image round width="24" height="24" fit="cover" :src="r.authorAvatar||''" class="reply-av"/>
                      <div class="reply-main">
                        <div class="reply-head">
                          <span class="reply-author">{{ r.authorName || (t('community.user') + r.userId) }}</span>
                          <span class="reply-tm">{{ r.date }}</span>
                        </div>
                        <div class="reply-content">{{ r.content }}</div>
                        <img v-if="r.image" :src="r.image" class="cmt-img" style="max-width:80px"/>
                        <div class="reply-actions">
                          <span class="cmt-action" @click.stop="handleLikeComment(r)"><van-icon name="good-job-o" size="12" /> {{ r.likes || '' }}</span>
                          <span class="cmt-action" @click.stop="startReply(r)">{{ t('community.reply') }}</span>
                          <!-- BUGID 修复：仅评论归属者本人可删除（防止他人删除） -->
                          <van-icon v-if="getToken() && currentUserId === r.userId" name="delete-o" size="12" color="#ccc" @click.stop="handleDeleteComment(r)"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 加载更多回复 -->
                  <div v-if="(replyList[c.id]||[]).length > (replyShowCount[c.id] || 5)" class="reply-toggle" @click.stop="replyShowCount[c.id] = (replyShowCount[c.id] || 5) + 5">
                    <span>{{ t('community.loadMoreReplies') }} <van-icon name="arrow-down" size="10" /></span>
                  </div>
                  <!-- 收起回复 -->
                  <div class="reply-toggle" @click.stop="toggleReplies(c.id)">
                    <span>{{ t('community.collapseReplies') }} <van-icon name="arrow-up" size="10" /></span>
                  </div>
                </template>
              </div>

              <!-- 无回复时的回复入口 -->
              <div v-else class="reply-zone"></div>
            </div>
            <!-- 删除按钮 -->
            <!-- BUGID 修复：仅评论归属者本人可删除（防止他人删除） -->
            <van-icon v-if="getToken() && currentUserId === c.userId" name="delete-o" size="14" color="#ccc" class="cmt-del" @click.stop="handleDeleteComment(c)"/>
          </div>
          <van-loading v-if="commentsLoading" class="comment-loading" size="22"/>
          <button v-else-if="commentsHasMore && !commentsFailed" type="button" class="load-comments" @click="loadComments(true)">{{ t('community.moreComments') }}</button>
        </div>
        <!-- 底部全局输入栏 -->
        <div class="dr-input-row" v-if="!replyTarget">
          <van-field v-model="commentInput" :placeholder="t('community.friendlyComment')" :border="false" maxlength="1000" class="dr-input" @keydown.enter.prevent="handleSendComment"/>
          <button type="button" class="dr-send" :aria-label="t('community.send')" :disabled="sending || !commentInput.trim()" @click.stop="handleSendComment"><van-icon name="guide-o" size="18" color="#fff"/></button>
        </div>
        <div class="dr-input-row replying" v-else>
          <span class="replying-label">{{ t('community.replyTo', { name: replyTarget.authorName }) }}</span>
          <van-field v-model="replyInputs[replyTarget.rootId]" :placeholder="t('community.writeReply')" :border="false" maxlength="1000" class="dr-input" @keydown.enter.prevent="handleSendReply"/>
          <button type="button" class="dr-send" :aria-label="t('community.send')" :disabled="sending || !replyInputs[replyTarget.rootId]?.trim()" @click.stop="handleSendReply()"><van-icon name="guide-o" size="18" color="#fff"/></button>
          <van-icon name="cross" size="18" color="#999" @click.stop="cancelReply" style="margin-left:8px;cursor:pointer"/>
        </div>
      </div>
      </Transition>
  </div>
  <div v-else class="video-loading"><template v-if="isLoading"><van-loading size="32" color="#fff"/><p>{{ t('community.authorVideosLoading') }}</p></template><template v-else><van-icon :name="loadFailed ? 'warning-o' : 'video-o'" size="48"/><h1>{{ t(loadFailed ? 'community.videoLoadFailed' : 'community.emptyVideos') }}</h1><p>{{ t('community.emptyVideoHint') }}</p><button v-if="loadFailed" type="button" @click="loadVideos">{{ t('community.retryPlay') }}</button><button type="button" @click="router.push('/community')">{{ t('community.emptyVideosBtn') }}</button></template></div>

  <van-popup v-model:show="showMore" position="bottom" round teleport="body" class="video-utility-popup" closeable :close-button-aria-label="t('common.close')">
    <div class="utility-content"><h2>{{ t('community.moreActions') }}</h2><button type="button" @click="showMore = false; openCollection()"><van-icon name="star-o"/>{{ t('collection.saveToCollection') }}</button><button type="button" @click="showMore = false; router.push({ path: '/note-detail', query: { id: current.id } })"><van-icon name="notes-o"/>{{ t('community.viewNote') }}</button><button type="button" @click="showMore = false; openReport()"><van-icon name="warning-o"/>{{ t('report.title') }}</button></div>
  </van-popup>
  <van-popup v-model:show="showShare" position="bottom" round teleport="body" class="video-utility-popup" closeable>
    <div class="utility-content"><h2>{{ t('community.shareVideo') }}</h2><p>{{ current.title }}</p><label for="video-share-link">{{ t('community.shareLink') }}</label><input id="video-share-link" class="share-link" :value="shareUrl" readonly @focus="$event.target.select()"/><button type="button" class="primary-action" @click="copyLink"><van-icon name="link-o"/>{{ t('community.copyLink') }}</button><button v-if="canSystemShare" type="button" @click="systemShare"><van-icon name="share-o"/>{{ t('community.systemShare') }}</button><small>{{ t('community.shareHint') }}</small></div>
  </van-popup>
  <van-popup v-model:show="showSearch" position="bottom" round teleport="body" class="video-utility-popup search-popup" closeable>
    <div class="utility-content"><h2>{{ t('community.searchVideos') }}</h2><form class="video-search-form" @submit.prevent="searchVideos"><input v-model="searchInput" :placeholder="t('community.videoSearchPlaceholder')" :aria-label="t('community.searchVideos')" maxlength="100"/><button type="submit" :disabled="searching || !searchInput.trim()"><van-icon name="search"/></button></form><van-loading v-if="searching" size="24"/><p v-else-if="searchFailed" role="alert">{{ t('community.videoLoadFailed') }}</p><p v-else-if="searchSubmitted && !searchResults.length">{{ t('community.noVideoResults') }}</p><p v-else-if="!searchSubmitted">{{ t('community.searchHint') }}</p><div v-else class="search-results"><button v-for="note in searchResults" :key="note.id" type="button" class="search-result" @click="selectSearchResult(note)"><van-icon name="play-circle-o" size="28"/><span><strong>{{ note.title }}</strong><small>{{ note.authorName || t('community.traveler') }}</small></span><van-icon name="arrow"/></button></div></div>
  </van-popup>

  <!-- 举报弹层（新功能，视频即游记 note） -->
  <ReportSheet v-if="showReportSheet" v-model:show="showReportSheet" target-type="note" :target-id="current.id" teleport="body" />
  <CollectionSheet v-model:show="showCollectionSheet" :note-id="current.id" teleport="body" />
  </div>
</template>

<style scoped>

/* PX keeps this full-viewport player independent of the app's mobile rem scaling. */
.video-page-root { min-height:100dvh; background:#101114; color:#f5f5f7; font-size:14PX; }
.video-shell { position:fixed; inset:0; z-index:1000; height:100dvh; background:#101114; overflow:hidden; color:#f5f5f7; }
.video-shell button, .utility-content button { font:inherit; color:inherit; cursor:pointer; border:0; }
.video-shell button:disabled, .utility-content button:disabled { opacity:.35; cursor:default; }
.video-shell :focus-visible, .utility-content :focus-visible { outline:2PX solid #a99aff; outline-offset:3PX; }
.top-bar { position:absolute; top:0; left:0; right:0; height:72PX; display:flex; align-items:center; justify-content:space-between; padding:0 28PX; z-index:15; background:#141519; border-bottom:1PX solid #ffffff0d; }
.top-brand { display:flex; align-items:center; gap:18PX; }
.top-icon { width:36PX; height:36PX; display:grid; place-items:center; background:transparent; border-radius:50%; }
.brand-mark { display:flex; align-items:center; gap:10PX; font-size:17PX; font-weight:700; letter-spacing:1PX; }
.brand-mark .van-icon { color:#b9a6ff; font-size:26PX; }
.feed-heading { display:flex; align-items:center; gap:24PX; }
.active-feed { position:relative; font-size:16PX; font-weight:650; }
.active-feed:after { content:''; position:absolute; width:20PX; height:3PX; border-radius:3PX; background:#ae94ff; left:calc(50% - 10PX); bottom:-14PX; }
.feed-subtitle { font-size:12PX; color:#82838e; }
.search-entry { display:flex; align-items:center; gap:10PX; padding:9PX 14PX; min-width:190PX; border:1PX solid #ffffff14!important; border-radius:10PX; background:#202126; color:#a9a9b2!important; font-size:12PX!important; }
.search-entry kbd { margin-left:auto; font:inherit; opacity:.5; }
.video-zone { position:absolute; top:92PX; left:92PX; right:390PX; bottom:90PX; overflow:hidden; background:#060607; border-radius:16PX; touch-action:none; }
.video-current, .video-neighbor { position:absolute; inset:0; width:100%; height:100%; }
.full-video, .video-neighbor video { width:100%; height:100%; object-fit:contain; background:#060607; }
.video-current.landscape .full-video { object-fit:contain; }
.video-neighbor { pointer-events:none; }
.video-neighbor-prev { transform:translateY(-100%); }
.video-neighbor-next { transform:translateY(100%); }
.video-track { position:relative; width:100%; height:100%; will-change:transform; }
.video-track.snapping { transition:transform .25s ease; }
.video-track.dragging, .side-layer.dragging { transition:none; }
.play-indicator { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); color:#ffffffe0; filter:drop-shadow(0 4PX 16PX #0008); pointer-events:none; transition:opacity .2s; }
.play-indicator.hide { opacity:0; }
.buffer-indicator { position:absolute; top:24PX; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10PX; padding:8PX 14PX; border-radius:8PX; background:#151519b3; font-size:12PX; pointer-events:none; }
.playback-error, .no-video { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); display:grid; gap:16PX; text-align:center; justify-items:center; font-size:14PX; }
.playback-error button { background:#fff2; padding:10PX 18PX; border-radius:8PX; }
.heart-burst { position:absolute; top:45%; left:50%; font-size:80PX; pointer-events:none; animation:heart .8s ease-out forwards; }
@keyframes heart { 0% { opacity:1; transform:translate(-50%,-50%) scale(.3); } 50% { opacity:1; transform:translate(-50%,-50%) scale(1.3); } 100% { opacity:0; transform:translate(-50%,-50%) scale(1.8); } }
.swipe-hint { position:absolute; top:32%; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:4PX; color:#fffc; font-size:12PX; pointer-events:none; text-shadow:0 2PX 8PX #000; }
.video-controls { position:absolute; left:18PX; right:18PX; bottom:8PX; z-index:10; }
.video-controls:before { content:''; position:absolute; z-index:-1; inset:-30PX -18PX -8PX; background:linear-gradient(transparent,#000c); pointer-events:none; }
.video-progress-range { display:block; width:100%; height:20PX; margin:0; padding:0; appearance:none; background:transparent; cursor:pointer; touch-action:none; }
.video-progress-range::-webkit-slider-runnable-track { height:3PX; border-radius:3PX; background:linear-gradient(to right,#fff 0 var(--progress),#ffffff40 var(--progress) 100%); }
.video-progress-range::-webkit-slider-thumb { width:9PX; height:9PX; margin-top:-3PX; border:0; border-radius:50%; appearance:none; background:#fff; }
.video-progress-range::-moz-range-track { height:3PX; background:#ffffff40; }
.video-progress-range::-moz-range-progress { height:3PX; background:#fff; }
.video-progress-range::-moz-range-thumb { width:9PX; height:9PX; border:0; background:#fff; }
.video-bottom-row { display:flex; align-items:center; gap:8PX; }
.video-time-tt { font-size:11PX; color:#d0d0d5; font-variant-numeric:tabular-nums; white-space:nowrap; }
.player-button { display:flex; align-items:center; justify-content:center; gap:6PX; min-width:32PX; height:32PX; padding:0 5PX; background:transparent; font-size:11PX!important; }
.player-options { margin-left:auto; display:flex; align-items:center; gap:6PX; }
.speed-select { font:inherit; font-size:12PX; color:#fff; background:#232329; border:1PX solid #fff2; border-radius:6PX; height:28PX; padding:0 4PX; }
.landscape-watch-btn { display:none; }
.side-layer { position:absolute; inset:0; z-index:3; pointer-events:none; }
.side-layer > * { pointer-events:auto; }
.side-layer.snapping { transition:transform .25s ease; }
.side-actions { position:absolute; right:326PX; bottom:176PX; display:flex; flex-direction:column; align-items:center; gap:18PX; width:56PX; }
.side-avatar-ring { width:44PX; height:44PX; border:2PX solid #fff9; border-radius:50%; overflow:hidden; margin-bottom:2PX; }
.avatar-fallback { display:grid; place-items:center; width:100%; height:100%; font-weight:650; font-size:18PX; background:linear-gradient(145deg,#77718e,#343242); }
.side-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5PX; background:transparent; min-width:44PX; min-height:44PX; filter:drop-shadow(0 2PX 5PX #0008); transition:transform .15s; }
.side-btn:hover:not(:disabled) { transform:translateY(-2PX); }
.side-num { font-size:11PX; line-height:1.3; font-weight:550; }
.more-action { min-height:30PX; }
.bottom-info { position:absolute; right:24PX; top:92PX; bottom:90PX; width:282PX; padding:24PX 20PX; overflow-y:auto; overscroll-behavior:contain; border-radius:16PX; background:#1a1b20; border:1PX solid #ffffff0b; scrollbar-width:thin; scrollbar-color:#ffffff24 transparent; }
.info-eyebrow { display:flex; align-items:center; gap:6PX; color:#aaa7b8; font-size:10PX; letter-spacing:2PX; margin-bottom:28PX; }
.info-eyebrow > span:last-child { margin-left:auto; color:#777380; font-variant-numeric:tabular-nums; }
.live-dot { width:5PX; height:5PX; border-radius:50%; background:#b39bff; }
.bottom-author { display:flex; align-items:center; gap:8PX; margin-bottom:20PX; }
.b-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14PX; font-weight:650; }
.follow-chip { flex-shrink:0; padding:6PX 10PX; border-radius:6PX; background:#a58bff!important; color:#17111f!important; font-size:11PX!important; font-weight:650!important; margin-left:auto; }
.follow-chip.followed { background:#ffffff10!important; color:#b7b5c1!important; }
.video-title { font-size:22PX; font-weight:650; line-height:1.4; letter-spacing:-.5PX; margin:0 0 12PX; overflow-wrap:anywhere; }
.video-stats { display:flex; align-items:center; flex-wrap:wrap; gap:12PX; font-size:10PX; color:#9695a2; margin-bottom:18PX; }
.video-stats span { display:inline-flex; gap:4PX; align-items:center; }
.video-tags { display:flex; flex-wrap:wrap; gap:7PX; margin-bottom:14PX; }
.video-tag { font-size:11PX; color:#c7b9ff; }
.b-desc { font-size:12PX; color:#bbb9c5; line-height:1.8; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; white-space:pre-line; }
.b-desc.expanded { display:block; max-height:240PX; overflow-y:auto; }
.description-toggle { background:transparent; color:#c7b9ff!important; font-size:11PX!important; margin-top:6PX; }
.location-chip { display:inline-flex; gap:5PX; align-items:center; font-size:11PX; margin-top:12PX; padding:6PX 8PX; background:#ffffff0c; border:1PX solid #ffffff0c; border-radius:6PX; }
.related-strip { display:flex; flex-direction:column; gap:12PX; margin-top:26PX; padding-top:20PX; border-top:1PX solid #ffffff0d; }
.related-label { color:#c9c7d1; font-size:12PX; font-weight:550; }
.related-card { display:flex; align-items:center; gap:10PX; width:100%; text-align:left; background:transparent; padding:0; }
.related-thumb { flex-shrink:0; width:45PX; height:56PX; border:1PX solid #fff1; border-radius:8PX; display:grid; place-items:center; background:linear-gradient(150deg,#464056,#242530); color:#d8ccff; }
.related-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:6PX; }
.related-copy strong { font-size:12PX; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.related-copy small { font-size:10PX; color:#9997a5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.note-link { display:flex; justify-content:space-between; width:100%; background:transparent; border-top:1PX solid #fff1!important; padding-top:18PX; margin-top:24PX; font-size:11PX!important; color:#aaa5bb!important; }
.feed-navigation { position:absolute; top:50%; left:23PX; transform:translateY(-50%); display:flex; flex-direction:column; align-items:center; gap:14PX; color:#777583; font-size:10PX; }
.feed-navigation button { display:grid; place-items:center; width:42PX; height:42PX; border-radius:50%; background:#23242b; font-size:18PX; color:#d8d5e2; }
.watch-footer { position:absolute; bottom:24PX; left:92PX; right:24PX; height:44PX; display:flex; align-items:center; gap:28PX; }
.comment-launcher { display:flex; align-items:center; gap:12PX; width:min(500PX, 62%); height:44PX; padding:0 16PX; border:1PX solid #ffffff0b!important; background:#1e1f25; color:#a3a0af!important; border-radius:10PX; font-size:12PX!important; }
.comment-count { display:flex; gap:8PX; margin-left:auto; font-size:11PX; }
.keyboard-hint { margin-left:auto; color:#777581; font-size:10PX; white-space:nowrap; }
.drawer-backdrop { position:absolute; top:72PX; right:0; bottom:0; width:316PX; z-index:18; background:#101114b3; }
.comment-drawer { position:absolute; top:92PX; bottom:90PX; right:24PX; width:282PX; height:auto; display:flex; flex-direction:column; overflow:hidden; background:#1a1b20; border:1PX solid #ffffff12; border-radius:16PX; z-index:20; }
.drawer-grabber { flex-shrink:0; touch-action:none; }
.handle-row { display:none; }
.dr-header { display:flex; align-items:center; justify-content:space-between; padding:16PX; border-bottom:1PX solid #ffffff0d; }
.dr-title { font-size:14PX; font-weight:650; }
.close-panel { display:grid; place-items:center; width:30PX; height:30PX; background:transparent; border-radius:50%; color:#aaa!important; }
.dr-list { flex:1; min-height:0; overflow-y:auto; padding:0 16PX; overscroll-behavior:contain; }
.no-cmt { display:grid; justify-items:center; gap:12PX; text-align:center; padding:48PX 10PX; color:#aaa6b5; font-size:13PX; }
.no-cmt small { font-size:11PX; color:#7d788c; line-height:1.7; }
.no-cmt button, .load-comments { background:#ffffff10; border-radius:8PX; padding:10PX; color:#bba6ff!important; font-size:12PX!important; }
.comment-loading { text-align:center; padding:20PX; }
.load-comments { display:block; margin:16PX auto; }
.cmt-row { display:flex; gap:10PX; padding:16PX 0; border-bottom:1PX solid #ffffff0d; align-items:flex-start; }
.cmt-av, .reply-av { flex-shrink:0; background:#30303a; }
.cmt-main, .reply-main { flex:1; min-width:0; }
.cmt-head, .reply-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4PX; margin-bottom:6PX; font-size:11PX; color:#b1abbf; }
.cmt-tm, .reply-tm { font-size:10PX; color:#76717f; }
.cmt-txt, .reply-content { font-size:13PX; line-height:1.65; color:#e1dce9; overflow-wrap:anywhere; }
.cmt-img { max-width:120PX; border-radius:8PX; margin-top:6PX; }
.cmt-vid { width:100%; max-height:150PX; border-radius:8PX; margin-top:6PX; background:#000; }
.cmt-del { flex-shrink:0; cursor:pointer; }
.cmt-actions-row, .reply-actions { display:flex; gap:16PX; align-items:center; margin-top:8PX; }
.cmt-action { font-size:11PX; color:#9991a8; cursor:pointer; display:inline-flex; align-items:center; gap:4PX; }
.reply-zone { margin-top:8PX; }
.reply-toggle { display:inline-flex; align-items:center; gap:4PX; padding:6PX 0; font-size:11PX; color:#bba6ff; cursor:pointer; }
.reply-toggle-line { width:18PX; height:1PX; background:#ffffff26; margin-right:4PX; }
.reply-preview { font-size:12PX; line-height:1.6; color:#a8a0b6; }
.reply-preview-author, .reply-author { color:#c6b6ef; }
.reply-item { display:flex; gap:8PX; padding:8PX 0; }
.dr-input-row { display:flex; align-items:center; gap:8PX; margin:12PX; padding:8PX 10PX; border:1PX solid #ffffff14; border-radius:12PX; background:#ffffff08; }
.dr-input { flex:1; min-width:0; background:transparent!important; padding:4PX 0!important; }
.dr-input :deep(.van-field__control) { color:#fff; font-size:13PX; }
.dr-input :deep(.van-field__control::placeholder) { color:#9a93a8; }
.dr-send { display:grid; place-items:center; flex-shrink:0; width:32PX; height:32PX; border-radius:8PX; background:#9a7deb; }
.dr-input-row.replying { flex-wrap:wrap; }
.replying-label { width:100%; font-size:11PX; color:#c9b6ff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.drawer-slide-enter-active, .drawer-slide-leave-active { transition:transform .25s ease,opacity .25s ease; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform:translateY(30PX); opacity:0; }
.drawer-fade-enter-active, .drawer-fade-leave-active { transition:opacity .2s; }
.drawer-fade-enter-from, .drawer-fade-leave-to { opacity:0; }
.video-loading { position:fixed; inset:0; z-index:1000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18PX; padding:24PX; background:#101114; color:#b7b0c8; text-align:center; }
.video-loading h1 { font-size:20PX; color:#fff; }
.video-loading p { font-size:13PX; }
.video-loading button { border:1PX solid #fff2; border-radius:10PX; padding:10PX 22PX; background:#27232f; color:#fff; font-size:13PX; cursor:pointer; }
.video-utility-popup { background:#1c1c24; color:#fff; max-height:80dvh; width:min(100%,480PX); left:max(0PX,calc((100% - 480PX)/2)); right:auto; font-size:14PX; }
.utility-content { display:flex; flex-direction:column; gap:16PX; padding:26PX 24PX max(24PX,env(safe-area-inset-bottom)); }
.utility-content h2 { font-size:18PX; padding-right:30PX; }
.utility-content p, .utility-content label { font-size:13PX; color:#b5afc4; }
.utility-content small { color:#9e96ae; font-size:12PX; line-height:1.6; }
.utility-content > button { display:flex; align-items:center; justify-content:center; gap:12PX; padding:14PX; border-radius:10PX; background:#ffffff0a; }
.utility-content .primary-action { background:#a58bff; color:#1b1428; font-weight:650; }
.share-link, .video-search-form input { width:100%; min-width:0; border:1PX solid #fff2; border-radius:8PX; background:#111117; color:#ded7ed; padding:12PX; font-size:13PX; }
.video-search-form { display:flex; gap:8PX; }
.video-search-form button { width:44PX; flex-shrink:0; background:#a58bff; color:#1b1428; border-radius:8PX; }
.search-results { display:flex; flex-direction:column; gap:8PX; max-height:50dvh; overflow-y:auto; }
.search-result { display:flex; align-items:center; gap:12PX; padding:12PX; text-align:left; background:#ffffff08; border-radius:10PX; }
.search-result span { flex:1; display:flex; flex-direction:column; gap:8PX; min-width:0; }
.search-result strong { font-size:14PX; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.video-zone:fullscreen { position:fixed!important; inset:0!important; width:100%!important; height:100%!important; border-radius:0; }
.video-zone:fullscreen .video-current { inset:0!important; height:100%!important; }
.video-zone:fullscreen .video-controls { bottom:16PX; }
.video-shell.fullscreen .landscape-watch-btn, .video-shell.fullscreen .swipe-hint { display:none; }
@media (min-width:901px) { .comment-drawer { height:auto!important; } }
@media (max-width: 900px) {
  .video-shell { background:#070708; }
  .top-bar { height:calc(64PX + env(safe-area-inset-top)); padding:env(safe-area-inset-top) 16PX 0; background:linear-gradient(#0008,transparent); border:0; }
  .brand-mark, .feed-subtitle, .search-entry span, .search-entry kbd { display:none; }
  .active-feed { font-size:16PX; text-shadow:0 2PX 8PX #000; }
  .active-feed:after { bottom:-9PX; }
  .search-entry { min-width:36PX; width:36PX; height:36PX; padding:0; justify-content:center; background:transparent; border:0!important; color:#fff!important; }
  .video-zone { inset:0 0 calc(54PX + env(safe-area-inset-bottom)); border-radius:0; }
  .full-video { object-fit:contain; }
  .video-current.landscape { top:72PX; bottom:238PX; height:auto; }
  .landscape-watch-btn { display:flex; align-items:center; justify-content:center; gap:7PX; position:absolute; top:calc(100% - 224PX); left:50%; transform:translateX(-50%); padding:7PX 12PX; border:1PX solid #ffffff26!important; border-radius:6PX; background:#ffffff0d; font-size:11PX!important; }
  .video-controls { left:14PX; right:14PX; bottom:4PX; }
  .player-button { min-width:30PX; }
  .mute-button span { font-size:10PX; }
  .side-actions { right:10PX; bottom:calc(188PX + env(safe-area-inset-bottom)); width:44PX; gap:15PX; }
  .side-avatar-ring { width:42PX; height:42PX; }
  .side-btn { min-width:44PX; min-height:40PX; }
  .side-num { font-size:10PX; }
  .more-action { min-height:24PX; }
  .bottom-info { top:auto; left:0; right:68PX; bottom:calc(112PX + env(safe-area-inset-bottom)); width:auto; max-height:190PX; padding:24PX 0 0 16PX; border:0; border-radius:0; background:linear-gradient(transparent,#0004); overflow-y:auto; text-shadow:0 2PX 6PX #0008; scrollbar-width:none; }
  .info-eyebrow, .related-strip, .note-link { display:none; }
  .bottom-author { margin-bottom:10PX; justify-content:flex-start; }
  .b-name { font-size:15PX; }
  .follow-chip { margin-left:2PX; padding:4PX 8PX; font-size:10PX!important; }
  .video-title { font-size:16PX; margin-bottom:6PX; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; letter-spacing:0; }
  .video-stats { margin-bottom:7PX; font-size:10PX; color:#b3afbb; }
  .video-tags { margin-bottom:7PX; }
  .video-tag { font-size:12PX; }
  .b-desc { -webkit-line-clamp:2; font-size:12PX; line-height:1.6; }
  .b-desc.expanded { max-height:120PX; }
  .location-chip { margin-top:6PX; font-size:10PX; padding:4PX 7PX; }
  .side-layer.under { opacity:0; pointer-events:none; }
  .side-layer.under > * { pointer-events:none; }
  .feed-navigation { left:auto; right:14PX; top:auto; bottom:calc(115PX + env(safe-area-inset-bottom)); transform:none; flex-direction:row; gap:4PX; }
  .feed-navigation button { width:28PX; height:30PX; border-radius:6PX; font-size:14PX; background:#ffffff12; }
  .feed-navigation span { display:none; }
  .watch-footer { left:0; right:0; bottom:0; height:calc(54PX + env(safe-area-inset-bottom)); padding:7PX 14PX calc(7PX + env(safe-area-inset-bottom)); border-top:1PX solid #ffffff0d; background:#131316; }
  .comment-launcher { width:100%; height:38PX; font-size:12PX!important; background:#202024; border-radius:8PX; }
  .keyboard-hint { display:none; }
  .drawer-backdrop { inset:0; width:auto; background:#0006; }
  .comment-drawer { top:auto; left:0; right:0; bottom:0; width:auto;  border-radius:20PX 20PX 0 0; background:#1c1c23; padding-bottom:env(safe-area-inset-bottom); transition:height .25s ease; }
  
  .comment-drawer.full { height:100dvh!important; border-radius:0; padding-top:env(safe-area-inset-top); }
  .comment-drawer.dragging { transition:none; }
  .handle-row { display:flex; justify-content:center; padding:10PX 0 0; }
  .handle-bar { width:32PX; height:4PX; border-radius:4PX; background:#ffffff30; }
  .dr-header { padding:8PX 16PX; }
  .dr-list { padding:0 20PX; }
  .dr-input-row { margin:10PX 14PX; }
  .drawer-slide-enter-from, .drawer-slide-leave-to { transform:translateY(100%); opacity:1; }
}
@media (max-width:900px) and (max-height:650px) {
  .side-actions { bottom:170PX; gap:6PX; }
  .side-avatar-ring { display:none; }
  .bottom-info { max-height:146PX; }
  .video-current.landscape { bottom:200PX; }
  .landscape-watch-btn { top:calc(100% - 190PX); }
}
@media (prefers-reduced-motion:reduce) {
  .video-page-root *, .video-page-root *:before { animation:none!important; transition:none!important; }
}

</style>
