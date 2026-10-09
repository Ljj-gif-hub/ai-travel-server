<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, Swipe, SwipeItem } from 'vant'

/*
 * 【Bug修复】显式声明组件名，供 keep-alive 的 include 白名单匹配
 * 缺失会导致 Tab 切换时组件无法命中缓存，每次销毁重建 → 空白
 */
defineOptions({ name: 'HomeView' })
import { areaList } from '@vant/area-data'
import { defineAsyncComponent } from 'vue'
const AIChatDialog = defineAsyncComponent(() => import('../components/AIChatDialog.vue'))
import EmptyState from '../components/EmptyState.vue'
import { getHotDestinations } from '../api/destination'
import { getHotSpotNames, findAttractionByName } from '../api/attraction'
import { HOME_PLAN_SAFE } from '../data/homePlanImages'
import { useStickyAfterTrigger } from '../composables/useStickyAfterTrigger'
import { noteApi, followApi, commentApi, uploadApi, planApi } from '../api'
import { getToken } from '../utils/auth'
import { avatarUrl } from '../utils/avatar'

const router = useRouter()
const { t } = useI18n()

/* ==================== 表单数据 ==================== */
const destination = ref('')
const budget = ref('')
const days = ref('')
const people = ref('')
const showCityPicker = ref(false)
const cityAreaRef = ref(null)
const wheelHandlers = ref([])

/* ==================== 更多产品弹出层 ==================== */
const showMoreProducts = ref(false)
const moreProductList = [
  { key: 'visa', icon: 'idcard' },
  { key: 'guide', icon: 'flag-o' },
  { key: 'cruise', icon: 'guide-o' },
  { key: 'wifi', icon: 'phone-o' },
  { key: 'insurance', icon: 'shield-o' },
  { key: 'postcard', icon: 'envelop-o' },
  { key: 'localGoods', icon: 'gift-o' },
  { key: 'travelPhoto', icon: 'photo-o' },
  { key: 'selfDrive', icon: 'logistics' },
  { key: 'luggage', icon: 'bag-o' },
  { key: 'currency', icon: 'gold-coin-o' },
  { key: 'lounge', icon: 'star-o' },
  { key: 'localExperience', icon: 'location-o' },
  { key: 'healthCheck', icon: 'service-o' },
]

/* ==================== 热门目的地快捷标签 ==================== */
const hotTags = ['北京', '上海', '成都', '三亚', '西安', '杭州', '重庆', '大理']

/* ==================== 城市的快捷标签（Layer 4） ==================== */
const cityQuickTags = ['北京', '杭州', '西安', '成都', '南京', '青岛', '上海']

/* ==================== 输入框独立 ref ==================== */
const budgetInputRef = ref(null)
const daysInputRef = ref(null)
const peopleInputRef = ref(null)

const handleBudgetInput = (e) => {
  const raw = e.target.value
  const filtered = raw.replace(/[^\d.]/g, '')
  const parts = filtered.split('.')
  const cleaned = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '')
  budget.value = cleaned
  if (e.target.value !== cleaned) e.target.value = cleaned
}

const handleDaysInput = (e) => {
  const raw = e.target.value
  const filtered = raw.replace(/\D/g, '')
  days.value = filtered
  if (e.target.value !== filtered) e.target.value = filtered
}

const handlePeopleInput = (e) => {
  const raw = e.target.value
  let filtered = raw.replace(/\D/g, '')
  if (filtered && parseInt(filtered) > 50) { filtered = '50'; showToast({ message: t('home.peopleMax50'), position: 'middle', duration: 1500 }) }
  people.value = filtered
  if (e.target.value !== filtered) e.target.value = filtered
}

const handleBudgetBlur = (e) => {
  const val = e.target.value.trim()
  budget.value = val
  if (val && parseFloat(val) < 100) showToast({ message: t('home.budgetMin100Suggest'), position: 'middle', duration: 1500 })
}

const handleDaysBlur = (e) => {
  const val = e.target.value.trim()
  days.value = val
  if (val && parseInt(val) < 1) { showToast({ message: t('home.daysMin1'), position: 'middle', duration: 1500 }); days.value = ''; e.target.value = '' }
}

const handlePeopleBlur = (e) => {
  const val = e.target.value.trim()
  people.value = val
  if (val && (parseInt(val) < 1 || parseInt(val) > 50)) showToast({ message: t('home.peopleRange'), position: 'middle', duration: 1500 })
}

/* ==================== 快捷入口（6宫格 — 2×3） ==================== */
const quickEntries = [
  { name: 'AI对话', icon: 'chat-o', color: '#8B5CF6', path: '/chat' },
  { name: '机票预订', icon: 'plane-o', color: '#34D399', path: '/flight-booking' },
  { name: '酒店预订', icon: 'hotel-o', color: '#F59E0B', path: '/hotel-booking' },
  { name: '景点门票', icon: 'orders-o', color: '#FB7185', path: '/orders' },
  { name: '美食攻略', icon: 'star-o', color: '#F97316', path: '/destinations' },
  { name: '游记社区', icon: 'file-text-o', color: '#3B82F6', path: '/notes' },
]

/* ==================== Layer 2: 服务图标 — 首行 4 个，其余进抽屉 ==================== */
const serviceRow1 = [
  { key: 'hotel', icon: 'M4 21V5h10v16M14 11h6v10M2 21h20M8 9h2M8 13h2M8 17h2M17 15h1M17 18h1', ready: true, path: '/hotel-booking' },
  { key: 'flight', icon: 'M12 2c-1 0-1.5 1-1.5 2v5L3 13v2l7.5-2v5L8 20v1l4-1 4 1v-1l-2.5-2v-5L21 15v-2l-7.5-4V4c0-1-.5-2-1.5-2Z', ready: true, path: '/flight-booking' },
  { key: 'guide', icon: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16', ready: true, path: '/destinations' },
]
const serviceRow2 = [
  { key: 'train', icon: 'exchange', ready: false },
  { key: 'homestay', icon: 'home-o', ready: false },
  { key: 'tickets', icon: 'orders-o', ready: false },
  { key: 'pickup', icon: 'logistics', ready: false },
  { key: 'car', icon: 'logistics', ready: false },
  { key: 'tour', icon: 'flag-o', ready: false },
]

/* ==================== Layer 5: 快捷功能标签 ==================== */
const quickTabs = [
  { name: '特价/直播', shortName: '特价', icon: 'coupon-o' },
  { name: '演出/展览', shortName: '展演', icon: 'music-o' },
  { name: '行程规划', shortName: '线路', icon: 'exchange' },
  { name: '旅行热点', shortName: '热点', icon: 'fire-o' },
  { name: '旅游榜单', shortName: '榜单', icon: 'medal-o' },
  { name: '地图', shortName: '地图', icon: 'location-o' },
]

/* ==================== 图片API ==================== */
// 携程模式：后端 API（POI 图片 / DB 缓存 / 第三方源）→ 静态 JSON 兜底
const staticImageMap = ref({})

const loadStaticImageMap = async () => {
  try {
    const resp = await fetch('/city-images.json')
    if (resp.ok) Object.assign(staticImageMap.value, await resp.json())
  } catch {}
  // 合并景点图映射：推广轮播/种草笔记里引用的景点名（黄果树瀑布、都江堰等）也能命中本地图
  try {
    const resp = await fetch('/attraction-images.json')
    if (resp.ok) {
      const attrMap = await resp.json()
      for (const [k, v] of Object.entries(attrMap)) {
        if (v && !staticImageMap.value[k]) staticImageMap.value[k] = v
      }
    }
  } catch {}
}

/** 获取图片：优先本地静态 JSON（真实地标），兜底后端 API */
const getImageUrl = (keyword) => staticImageMap.value[keyword] || `/api/city/image?name=${encodeURIComponent(keyword)}`

/** 兜底：静态 JSON（API 未覆盖时用） */
const resolveImage = (keyword) => staticImageMap.value[keyword] || getImageUrl(keyword)
const heroImage = '/travel-hero.jpg'

// 保留旅行灵感中的特色轮播，与普通游记卡片并列展示。
const promotionSlides = computed(() => [
  { image: getImageUrl('迪士尼'), title: 'home.promoFamilyTitle', subtitle: 'home.promoFamilySubtitle', tag: 'home.promoFamilyTag' },
  { image: getImageUrl('黄果树瀑布'), title: 'home.promoGuizhouTitle', subtitle: 'home.promoGuizhouSubtitle', tag: 'home.promoGuizhouTag' },
  { image: getImageUrl('都江堰'), title: 'home.promoDujiangyanTitle', subtitle: 'home.promoDujiangyanSubtitle', tag: 'home.promoDujiangyanTag' },
])

const defaultDestinations = computed(() => [
  { name: '北京', tag: '经典必去', image: getImageUrl('北京') },
  { name: '上海', tag: '都市潮流', image: getImageUrl('上海') },
  { name: '广州', tag: '美食之都', image: getImageUrl('广州') },
  { name: '深圳', tag: '创新之城', image: getImageUrl('深圳') },
  { name: '成都', tag: '网红打卡', image: getImageUrl('成都') },
  { name: '杭州', tag: '诗画江南', image: getImageUrl('杭州') },
  { name: '西安', tag: '千年古都', image: getImageUrl('西安') },
  { name: '重庆', tag: '8D魔幻', image: getImageUrl('重庆') },
])

const ph = (hue, label) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue},60%,65%)"/><stop offset="100%" stop-color="hsl(${hue+30},70%,45%)"/></linearGradient></defs><rect fill="url(#g)" width="400" height="300"/><text fill="rgba(255,255,255,0.7)" font-size="28" font-family="sans-serif" x="200" y="150" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`)}`

/* ==================== 社区种子数据（fallback） ==================== */
const seedNotes = computed(() => [
  {
    id: 1,
    author: { nickname: '带着娃看世界', avatar: avatarUrl('family', ''), city: '上海', isFollowing: false, online: true, userId: 'u6' },
    title: '🎠 上海迪士尼亲子二日游全攻略！轻松带娃不踩雷',
    content: '带4岁娃的上海迪士尼亲子攻略！轻松版游玩路线，避开人潮不用排长队。重点推荐旋转木马、小飞象和冰雪奇缘表演，孩子玩得超开心。附上园区儿童餐推荐和午睡tips。',
    images: [getImageUrl('上海'), getImageUrl('迪士尼'), getImageUrl('外滩')],
    viewCount: 12800, likeCount: 0, isLiked: false, tag: '亲子', time: '2小时前',
    hasVideo: false,
  },
  {
    id: 2,
    author: { nickname: '贵州旅行家小杨', avatar: avatarUrl('guizhou', ''), city: '贵阳', isFollowing: true, online: false, userId: 'u11' },
    title: '🏞️ 贵州旅游超全攻略｜7天6晚玩转黔东南',
    content: '刚回来！贵州太美了！黄果树瀑布气势磅礴，荔波小七孔水绿如翡翠，西江千户苗寨万家灯火震撼心灵。这份攻略整理了吃住行全攻略，人均不到3000玩转贵州精华景点！',
    images: [getImageUrl('黄果树瀑布'), getImageUrl('荔波'), getImageUrl('千户苗寨')],
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    viewCount: 35600, likeCount: 0, isLiked: false, tag: '贵州', time: '4小时前',
    hasVideo: true,
  },
  {
    id: 3,
    author: { nickname: '历史迷小王', avatar: avatarUrl('history', ''), city: '成都', isFollowing: false, online: true, userId: 'u12' },
    title: '📜 都江堰景区一日游｜千年水利工程太震撼了',
    content: '都江堰到底值不值得去？答案是：绝对值得！亲眼看到两千多年前李冰父子修建的水利工程至今仍在发挥作用，鱼嘴分水、飞沙堰溢洪、宝瓶口引水，古人的智慧让人叹服。附上门票交通全攻略。',
    images: [getImageUrl('都江堰'), getImageUrl('成都'), getImageUrl('青城山')],
    viewCount: 22100, likeCount: 0, isLiked: false, tag: '都江堰', time: '6小时前',
    hasVideo: false,
  },
  {
    id: 4,
    author: { nickname: '酒店控小鹿', avatar: avatarUrl('hotellover', ''), city: '上海', isFollowing: false, online: false, userId: 'u13' },
    title: '🏨 上海外滩周边高性价比酒店推荐｜睡在风景里',
    content: '整理了上海外滩/南京路周边5家高性价比酒店，从网红民宿到五星级酒店都有实测。关键看江景、交通便利度和性价比。和平饭店的下午茶、华尔道夫的老上海风情，每一家都有独特体验！',
    images: [getImageUrl('上海'), getImageUrl('南京路'), getImageUrl('陆家嘴')],
    viewCount: 18900, likeCount: 0, isLiked: false, tag: '上海', time: '8小时前',
    hasVideo: false,
  },
  {
    id: 5,
    author: { nickname: '贵阳本地通', avatar: avatarUrl('guiyang', ''), city: '贵阳', isFollowing: true, online: true, userId: 'u14' },
    title: '🌄 贵阳周边绝美风景｜本地人私藏的小众打卡地',
    content: '贵阳不止有甲秀楼！花溪十里河滩骑行、青岩古镇品猪蹄、天河潭看溶洞瀑布、黔灵山看野生猕猴…这些本地人常去的地方才是贵阳的正确打开方式。美食推荐：肠旺面、丝娃娃、酸汤鱼，好吃到哭！',
    images: [getImageUrl('贵阳'), getImageUrl('青岩古镇'), getImageUrl('黔灵山')],
    viewCount: 15200, likeCount: 0, isLiked: false, tag: '贵阳', time: '12小时前',
    hasVideo: false,
  },
  {
    id: 6,
    author: { nickname: '背包客阿飞', avatar: avatarUrl('backpack', ''), city: '大理', isFollowing: true, online: true, userId: 'u5' },
    title: '🌾 大理旅居一个月｜环洱海自驾保姆级攻略',
    content: '大理旅居一个月，整理了这份环洱海自驾攻略。路线：古城-喜洲-双廊-挖色-海东。全程130公里，建议分两天慢慢玩。喜洲的稻田、双廊的日落、海东的悬崖公路，每一段都让人不想离开。',
    images: [getImageUrl('大理'), getImageUrl('喜洲'), getImageUrl('双廊')],
    viewCount: 45600, likeCount: 0, isLiked: false, tag: '大理', time: '1天前',
    hasVideo: false,
  },
  {
    id: 7,
    author: { nickname: '吃货小分队', avatar: avatarUrl('foodie', ''), city: '成都', isFollowing: true, online: false, userId: 'u2' },
    title: '🍲 重庆本地人私藏的火锅地图｜这12家必须吃',
    content: '避开网红店，整理了12家藏在居民楼里的老火锅。每家都有特色招牌菜，从人均40到80都有。特别推荐弹子石的巷子火锅和观音桥的防空洞火锅，麻辣鲜香巴适得板！建议收藏！',
    images: [getImageUrl('重庆'), getImageUrl('洪崖洞'), getImageUrl('解放碑')],
    videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    viewCount: 38900, likeCount: 0, isLiked: false, tag: '重庆', time: '1天前',
    hasVideo: true,
  },
  {
    id: 8,
    author: { nickname: '摄影师Mr陈', avatar: avatarUrl('photoc', ''), city: '杭州', isFollowing: false, online: false, userId: 'u15' },
    title: '📸 杭州西湖边的绝美咖啡馆合集｜拍照超出片',
    content: '整理了环西湖最值得去的5家独立咖啡馆，从断桥边的民国老宅到龙井山上的玻璃房。每一家都有独特的设计美学和出品，附上每家的推荐饮品和最佳拍摄机位，文艺青年必收藏！',
    images: [getImageUrl('杭州'), getImageUrl('西湖'), getImageUrl('龙井')],
    viewCount: 27300, likeCount: 0, isLiked: false, tag: '杭州', time: '2天前',
    hasVideo: false,
  },
  {
    id: 9,
    author: { nickname: '户外探险家', avatar: avatarUrl('hiker', ''), city: '西安', isFollowing: false, online: true, userId: 'u3' },
    title: '⛰️ 华山一日游挑战长空栈道｜云海翻涌太震撼',
    content: '早上5点出发，索道上北峰，一路徒步经过苍龙岭、金锁关，最后挑战长空栈道。虽然腿软但风景绝美，云海翻涌，值得一生铭记的体验。附登山装备清单和体力分配建议！',
    images: [getImageUrl('华山'), getImageUrl('西安'), getImageUrl('渭南')],
    viewCount: 31200, likeCount: 0, isLiked: false, tag: '华山', time: '2天前',
    hasVideo: false,
  },
  {
    id: 10,
    author: { nickname: '旅行者小明', avatar: avatarUrl('ming', ''), city: '深圳', isFollowing: false, online: true, userId: 'u1' },
    title: '🚴 深圳湾公园骑行｜沿海岸线看绝美日落',
    content: '深圳湾公园骑行真的太舒服了！沿着海岸线一路骑行，海风轻拂，视野开阔。推荐傍晚时分出发，可以看到绝美的海上日落，沿途还有很多拍照打卡点。全程15公里左右，新手也完全能驾驭。',
    images: [getImageUrl('深圳'), getImageUrl('深圳湾'), getImageUrl('大梅沙')],
    viewCount: 19500, likeCount: 0, isLiked: false, tag: '深圳', time: '3天前',
    hasVideo: false,
  },
])

const defaultExperiences = [
  { id: 1, key: 'riceNoodles', icon: 'food-o', color: '#FCA5A5' },
  { id: 2, key: 'hotpot', icon: 'flower-o', color: '#EF4444' },
  { id: 3, key: 'diving', icon: 'guide-o', color: '#3B82F6' },
  { id: 4, key: 'skiing', icon: 'photo-o', color: '#60A5FA' },
  { id: 5, key: 'hotSpring', icon: 'smile-o', color: '#FB923C' },
  { id: 6, key: 'hiking', icon: 'flag-o', color: '#22C55E' },
]

/* ==================== 响应式数据 ==================== */
const hotDestinations = ref([])
const experiences = ref([])

const isLoading = ref({ destinations: true, notes: true })

const loadHotDestinations = async () => {
  isLoading.value.destinations = true
  try {
    const res = await getHotDestinations()
    const list = res.data || []
    hotDestinations.value = list.length ? list.map(item => ({ ...item, image: item.imageUrl || getImageUrl(item.name), tag: item.tag || '热门推荐' })) : defaultDestinations.value
  } catch (e) {
    hotDestinations.value = defaultDestinations.value
  } finally { isLoading.value.destinations = false }
}

const loadExperiences = () => { experiences.value = defaultExperiences }

/* ==================== 携程风格模块 ==================== */
const ctripTabs = ref([
  { key: 'all', label: '全部', icon: 'star-o' },
  { key: 'hot', label: '热门', icon: 'flame-o' },
  { key: 'recommend', label: '推荐', icon: 'thumbs-up-o' },
  { key: 'new', label: '最新', icon: 'clock-o' },
])
const ctripActiveTab = ref('all')

const formatNumber = (num) => {
  if (!num || num < 0) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

/* ==================== 社区模块（复刻自CommunityView） ==================== */
const activeTab = ref('all')
const currentCity = ref('深圳')
const showCommunityCityPicker = ref(false)
const cityColumns = [
  { text: '深圳', value: '深圳' },
  { text: '北京', value: '北京' },
  { text: '上海', value: '上海' },
  { text: '成都', value: '成都' },
  { text: '西安', value: '西安' },
  { text: '杭州', value: '杭州' },
  { text: '重庆', value: '重庆' },
  { text: '大理', value: '大理' },
  { text: '三亚', value: '三亚' },
  { text: '广州', value: '广州' },
  { text: '南京', value: '南京' },
  { text: '武汉', value: '武汉' },
]

const onCommunityCityConfirm = ({ selectedOptions }) => {
  if (selectedOptions && selectedOptions[0]) {
    currentCity.value = selectedOptions[0].text
  }
  showCommunityCityPicker.value = false
}

const notes = ref([])
const notesLoading = ref(true)
const page = ref(1)
const hasMore = ref(true)
const loadingMore = ref(false)

const empty = computed(() => !notesLoading.value && notes.value.length === 0)

// 瀑布流：图片卡片统一 3:4 竖置，视频卡片自适应
const getCardAspectClass = (index) => {
  return 'aspect-3-4'
}

// 图片卡片：统一 3:4 竖置比例
const getImageCardAspect = () => 'aspect-3-4'

// 视频卡片：根据 note 里的视频自适应（默认 16:9）
const getVideoCardAspect = (note) => {
  return 'aspect-video'
}

// 左右列统一用 3:4 竖置（视频卡片会用不同 class）
const getLeftCardAspect = (index) => 'aspect-3-4'
const getRightCardAspect = (index) => 'aspect-3-4'

// 携程风瀑布流：显示所有已加载的笔记（随滚动加载逐步增多，不再固定前10条）
const displayNotes = computed(() => notes.value)
const noteColumns = computed(() => [
  displayNotes.value.filter((_, index) => index % 2 === 0),
  displayNotes.value.filter((_, index) => index % 2 === 1),
])

const goToCommunity = () => {
  try { router.push('/notes') } catch (e) { console.error('goToCommunity 失败:', e) }
}

/* BUGID PAGE-1 修复：加载序号守卫，防止触底滚动与首屏加载并发重复拉页（旧的 loadingMore 无并发守卫） */
const loadSeq = ref(0)
const loadNotes = async (reset = false) => {
  if (reset) {
    page.value = 1
    hasMore.value = true
    notesLoading.value = true
  }
  if (!hasMore.value && !reset) return
  const seq = ++loadSeq.value
  try {
    loadingMore.value = !reset
    // 服务端分页加载
    const res = await noteApi.getAllNotes(page.value)
    if (seq !== loadSeq.value) return  // 已有更新的加载请求，丢弃本次结果
    if (res && res.code === 0 && res.data) {
      const list = Array.isArray(res.data) ? res.data : (res.data.list || [])
      const mapped = list.map(mapNoteItem)
      if (reset) {
        notes.value = mapped
      } else {
        notes.value = [...notes.value, ...mapped].slice(-50)  // 最多保留50条防OOM
      }
      hasMore.value = res.data.hasMore !== undefined ? res.data.hasMore : (list.length >= (res.data.size || 10))
      page.value += 1
    } else {
      if (reset) notes.value = [...seedNotes.value]
      hasMore.value = false
    }
  } catch (e) {
    if (seq !== loadSeq.value) return
    console.warn('加载社区笔记失败，使用本地种子数据:', e.message)
    if (reset) notes.value = [...seedNotes.value]
    hasMore.value = false
  } finally {
    if (seq !== loadSeq.value) return
    notesLoading.value = false
    loadingMore.value = false
    isLoading.value.notes = false
  }
}

const extractImages = (html) => {
  if (!html) return []
  const regex = /<img[^>]*\bsrc="([^">]+)"[^>]*>/gi
  const result = []
  let match
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) result.push(match[1])
  }
  return result
}

const extractVideos = (html) => {
  if (!html) return []
  const result = []
  const r1 = /<video[^>]*\bsrc="([^">]+)"[^>]*>/gi
  let m
  while ((m = r1.exec(html)) !== null) {
    if (m[1]) result.push(m[1])
  }
  const r2 = /<source[^>]*\bsrc="([^">]+)"[^>]*>/gi
  while ((m = r2.exec(html)) !== null) {
    if (m[1]) result.push(m[1])
  }
  return result
}

const stripHtml = (html) => {
  if (!html) return ''
  // <br> 标签转换为换行符，保留用户输入的换行格式
  let text = html.replace(/<br\s*\/?>/gi, '\n')
  // 移除img标签（不显示占位文字，图片已在卡片封面展示）
  text = text.replace(/<img[^>]*>/gi, '')
  // 移除其他标签
  text = text.replace(/<[^>]+>/g, '')
  // 解码常见实体
  text = text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return text.trim()
}

const mapNoteItem = (item) => {
  const isSeedData = !!item.author && typeof item.author === 'object'
  const authorNickname = isSeedData ? item.author.nickname : (item.authorName || item.nickname || t('home.traveler'))
  const authorAvatar = isSeedData ? item.author.avatar : (item.authorAvatar || item.avatar || avatarUrl(String(item.id || 'fallback'), authorNickname))
  const authorCity = isSeedData ? item.author.city : (item.city || '')
  const authorIsFollowing = isSeedData ? item.author.isFollowing : (item.isFollowing || false)
  const authorOnline = isSeedData ? item.author.online : (item.online !== undefined ? item.online : Math.random() > 0.4)
  // 作者ID：API 数据用后端返回的 userId（作者本人），绝不可回退到笔记 id，否则关注错人
  const authorUserId = isSeedData ? item.author.userId : (item.userId || item.authorId || null)
  let images = []
  if (isSeedData) {
    images = item.images || []
  } else {
    const contentImages = extractImages(item.content)
    const contentVideos = extractVideos(item.content)
    if (item.cover) images.push(item.cover)
    images = images.concat(contentImages).concat(contentVideos)
    images = [...new Set(images)]
  }
  const plainContent = isSeedData ? item.content : stripHtml(item.content)
  const rawCover = item.cover || ''
  const rawContent = item.content || ''
  const hasVideo = rawCover.match(/\.(mp4|webm|mov)(\?|$)/i)
    || /<video[^>]*src=/i.test(rawContent)
    || /<source[^>]*src="[^">]+\.(mp4|webm|mov)/i.test(rawContent)
    || images.some(img => isVideoUrl(img))
  // 【修复】videoUrl 从已构建的 images 数组中提取，而非原始 item
  // 根因：API 数据没有 item.images，视频 URL 在 extractVideos 中已提取到 images 数组
  const extractedVideoUrl = item.videoUrl || images.find(img => isVideoUrl(img)) || ''
  return {
    id: item.id,
    author: {
      nickname: authorNickname,
      avatar: authorAvatar,
      city: authorCity,
      isFollowing: authorIsFollowing,
      online: authorOnline,
      userId: authorUserId,
    },
    title: item.title || '',
    content: plainContent || '',
    images: images,
    videoUrl: extractedVideoUrl,
    hasVideo: item.hasVideo || !!hasVideo || !!extractedVideoUrl,
    viewCount: item.viewCount || item.views || 0,
    likeCount: item.likeCount || item.likes || 0,
    isLiked: item.isLiked || false,
    commentCount: item.commentCount || item.comments || 0,
    tag: item.tag || item.author?.city || authorCity || '',
    time: item.time || item.date || item.createTime || t('home.justNow'),
  }
}

const isVideoUrl = (url) => url && /\.(mp4|webm|mov)(\?|$)/i.test(url)

const getNoteCoverImage = (note) => {
  if (!note?.images?.length) return ''
  const cover = note.images.find(img => !isVideoUrl(img))
  return cover || ''
}

// 封面失败只切换一次到中性占位图，不使用无关城市或视频画面冒充实拍。
const coverPlaceholder = '/travel-cover.svg'
const onCoverError = (event) => {
  const img = event.target
  if (img.getAttribute('src') === coverPlaceholder) return
  img.src = coverPlaceholder
}

const goToDetail = (note) => {
  if (!note || !note.id) return
  if (note.hasVideo) {
    router.push(`/video-detail?id=${note.id}`)
  } else {
    router.push(`/note-detail?id=${note.id}`)
  }
}

const handleLike = async (note) => {
  const token = getToken()
  if (!token) {
    showToast({ message: t('common.notLoggedIn'), position: 'middle', duration: 1500 })
    return
  }
  const prevLiked = note.isLiked
  note.isLiked = !note.isLiked
  // BUGID L-HOME-2 修复：种子数据可能缺失 likeCount，对缺失值兜底，避免 NaN
  note.likeCount = (Number(note.likeCount) || 0) + (note.isLiked ? 1 : -1)
  try {
    const res = await noteApi.likeNote(note.id)
    if (res.code !== 0) throw new Error(res.message)
  } catch (e) {
    note.isLiked = prevLiked
    note.likeCount = (Number(note.likeCount) || 0) + (prevLiked ? 1 : -1)
    showToast({ message: t('home.operationFailedRetry'), position: 'middle', duration: 1500 })
  }
}

const handleFollow = async (author) => {
  const token = getToken()
  if (!token) {
    showToast({ message: t('common.notLoggedIn'), position: 'middle', duration: 1500 })
    return
  }
  const newState = !author.isFollowing
  // 同步所有该用户的笔记
  notes.value.forEach(n => {
    if (n.author?.userId === author.userId) n.author.isFollowing = newState
  })
  try {
    if (newState) {
      await followApi.follow(author.userId)
    } else {
      await followApi.unfollow(author.userId)
    }
  } catch (e) {
    notes.value.forEach(n => {
      if (n.author?.userId === author.userId) n.author.isFollowing = !newState
    })
    showToast({ message: t('home.operationFailedRetry'), position: 'middle', duration: 1500 })
  }
}

const commentInputs = reactive({})
const commentImages = reactive({})
const commentVideos = reactive({})
const commentUploading = reactive({})

const handleCommentUpload = async (noteId, e) => {
  const file = e.target.files?.[0]
  if (!file) return
  commentUploading[noteId] = true
  try {
    const res = await uploadApi.uploadFile(file)
    if (res.code === 0) {
      if (res.data.type === 'image') {
        commentImages[noteId] = res.data.url
        commentVideos[noteId] = ''
      } else {
        commentVideos[noteId] = res.data.url
        commentImages[noteId] = ''
      }
      showToast({ message: res.data.type === 'image' ? t('home.imageUploaded') : t('home.videoUploaded'), position: 'middle', duration: 1200 })
    } else {
      showToast({ message: res.message || t('home.uploadFailed'), position: 'middle', duration: 1500 })
    }
  } catch (e) {
    showToast({ message: t('home.uploadFailed'), position: 'middle', duration: 1500 })
  } finally {
    commentUploading[noteId] = false
  }
}

const handleSendComment = async (note) => {
  const text = (commentInputs[note.id] || '').trim()
  const img = commentImages[note.id] || ''
  const vid = commentVideos[note.id] || ''
  if (!text && !img && !vid) return
  const token = getToken()
  if (!token) {
    showToast({ message: t('common.notLoggedIn'), position: 'middle', duration: 1500 })
    return
  }
  try {
    const res = await commentApi.addComment(note.id, text || null, img || null, vid || null)
    if (res.code === 0) {
      note.commentCount = (note.commentCount || 0) + 1
      commentInputs[note.id] = ''
      commentImages[note.id] = ''
      commentVideos[note.id] = ''
      showToast({ message: t('home.commentSuccess'), position: 'middle', duration: 1200 })
    } else {
      showToast({ message: res.message || t('home.commentFailed'), position: 'middle', duration: 1500 })
    }
  } catch (e) {
    showToast({ message: t('home.commentFailedRetry'), position: 'middle', duration: 1500 })
  }
}

const handleCommunitySearch = () => {
  showToast({ message: t('home.searchInDevelopment'), position: 'middle', duration: 1500 })
}

const onTabChange = (key) => {
  activeTab.value = key
  if (key === 'following') {
    const token = getToken()
    if (!token) {
      showToast({ message: t('home.loginToViewFollowing'), position: 'middle', duration: 1500 })
      activeTab.value = 'all'
      return
    }
  }
}

/* ==================== 事件 ==================== */
const goToAgentPlanner = () => { router.push('/agent-planner') }
const spotSearchTags = getHotSpotNames()
const myPlans = ref([])
const latestPlan = computed(() => myPlans.value[0] || null)
const stripSpotName = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/【[^】]*】/g, '').replace(/\[.*?\]/g, '').trim()
const matchSafePlanSpot = (name) => {
  if (HOME_PLAN_SAFE[name]) return name
  return Object.keys(HOME_PLAN_SAFE).filter(k => name.includes(k)).sort((a, b) => b.length - a.length)[0] || ''
}
const brokenPlanNames = ref(new Set())
const onPlanImgError = (name) => {
  const next = new Set(brokenPlanNames.value)
  next.add(name)
  brokenPlanNames.value = next
}
const planCards = computed(() => {
  const p = latestPlan.value
  const dest = (p?.destination || p?.planData?.destination || '').replace(/市$/, '')
  const cards = []
  const used = new Set()
  const pushCard = (name, day) => {
    if (!name || used.has(name) || cards.length >= 3) return
    used.add(name)
    cards.push({ day: day || '', name, image: HOME_PLAN_SAFE[name].image })
  }
  for (const day of (p?.planData?.dayPlans || [])) {
    const spots = (day.timeSlots || []).map(s => stripSpotName(s.attraction)).filter(Boolean)
    pushCard(spots.map(matchSafePlanSpot).find(Boolean), `D${day.day || ''}`)
  }
  if (dest) {
    for (const [name, meta] of Object.entries(HOME_PLAN_SAFE)) {
      if (meta.city === dest || dest.includes(meta.city)) pushCard(name, '')
    }
  }
  if (cards.length) return cards
  return [
    { day: 'D1', name: '西湖', image: HOME_PLAN_SAFE['西湖'].image },
    { day: 'D2', name: '灵隐寺', image: HOME_PLAN_SAFE['灵隐寺'].image },
    { day: 'D3', name: '千岛湖', image: HOME_PLAN_SAFE['千岛湖'].image },
  ]
})
const visiblePlanCards = computed(() => planCards.value.filter(c => !brokenPlanNames.value.has(c.name)))
const planMeta = computed(() => {
  const p = latestPlan.value
  if (!p) return t('home.planPreviewMeta')
  const dest = p.destination || p.planData?.destination || ''
  const days = p.days || p.planData?.dayPlans?.length || 0
  return dest ? t('trips.dayTrip', { dest, days: days || 1 }) : t('home.planPreviewMeta')
})
const loadMyPlans = async () => {
  if (!getToken()) { myPlans.value = []; return }
  try {
    const res = await planApi.getSavedPlans()
    const list = res?.code === 0 ? (res.data || []) : []
    myPlans.value = list
      .filter(p => p.planData?.dayPlans?.length)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  } catch { myPlans.value = [] }
}
const openLatestPlan = () => {
  const p = latestPlan.value
  if (p?.id) router.push({ path: '/agent-map', query: { savedPlanId: p.id } })
  else goToAgentPlanner()
}
const goAttractionSearch = (q) => {
  router.push(q ? { path: '/attraction-search', query: { q } } : '/attraction-search')
}
const goAttractionTag = async (name) => {
  const hit = await findAttractionByName(name)
  if (hit?.id) router.push({ path: '/attraction-detail', query: { id: hit.id } })
  else goAttractionSearch(name)
}
const goTravelMap = () => { router.push('/trips') }
const goPlanWithCity = (tag) => {
  destination.value = tag
  sessionStorage.setItem('selected_destination_spot', tag)
  router.push('/agent-planner')
}

const handleQuickEntry = (entry) => {
  try {
    if (entry?.path) router.push(entry.path)
    else showToast({ message: t('home.featureInDevelopment'), position: 'middle' })
  } catch (e) { console.error('handleQuickEntry 失败:', e) }
}

/* 头部按钮点击：会员 / 积分 */
const handleHeaderBtn = (type) => {
  try {
    if (type === 'vip') router.push('/profile')
    else showToast({ message: t('home.pointsInDevelopment'), position: 'middle' })
  } catch (e) { console.error('handleHeaderBtn 失败:', e) }
}
/*
 * 【修复】热门目的地卡片点击 → 跳转城市详情页
 * 根因：此前只设置 destination.value = dest.name，页面无任何可见变化，用户以为点击无效
 */
const handleDestination = (dest) => {
  try {
    if (!dest || !dest.name) { showToast({ message: t('home.destinationError'), position: 'middle' }); return }
    router.push({ path: '/destination-detail', query: { city: dest.name } })
  } catch (e) { console.error('handleDestination 跳转失败:', e); showToast({ message: t('home.jumpFailed'), position: 'middle' }) }
}
const goToDestinations = () => {
  try { router.push('/destinations') } catch (e) { console.error('goToDestinations 失败:', e) }
}
const handleSearchSelect = (item) => { if (item?.text) destination.value = item.text; else if (item?.name) destination.value = item.name }
const searchHistory = computed(() => hotTags.map(c => ({ text: c, url: '' })))
const handleExperienceClick = (exp) => {
  try { showToast({ message: t('home.featureNamedInDevelopment', { name: exp?.key ? t(`home.experiences.${exp.key}`) : t('home.thatFeature') }), position: 'middle' }) } catch (e) {}
}
const selectHotTag = (tag) => { destination.value = tag }

/* Layer 4: 城市快捷标签点击 */
const handleCityTagClick = (city) => {
  try {
    if (!city) return
    router.push({ path: '/destination-detail', query: { city } })
  } catch (e) { console.error('handleCityTagClick 失败:', e) }
}

/* Layer 2: 服务入口点击 */
const handleServiceClick = (item) => {
  try {
    if (!item?.ready || !item.path) {
      showToast({ message: t('home.comingSoon'), position: 'middle', duration: 1200 })
      return
    }
    showMoreProducts.value = false
    router.push(item.path)
  } catch (e) { console.error('handleServiceClick 失败:', e) }
}

/* Layer 5: 快捷功能标签点击 */
const handleQuickTab = (tab) => {
  try {
    if (tab?.name === '行程规划') { goToAgentPlanner() }
    else if (tab?.name === '地图') { goTravelMap() }
    else { showToast({ message: t('home.featureInDevelopment'), position: 'middle' }) }
  } catch (e) { console.error('handleQuickTab 失败:', e) }
}

/* Layer 3: 更多产品点击 */
const handleMoreProductClick = () => {
  showToast({ message: t('home.comingSoon'), position: 'middle', duration: 1200 })
}

/* 【悬浮按钮】点击防抖：500ms内重复点击忽略，避免快速跳转多次 */
let aiBtnDebounce = false
const showAIChat = ref(false)  // 【5Tab架构】AI对话弹窗显隐
const goToAIChat = () => {
  if (aiBtnDebounce) return
  aiBtnDebounce = true
  setTimeout(() => { aiBtnDebounce = false }, 500)
  showAIChat.value = true       // 打开内嵌AI对话弹窗，不跳转页面
}

const onCityConfirm = (value) => {
  if (value && value.selectedOptions) destination.value = value.selectedOptions[1]?.text || value.selectedOptions[0]?.text || ''
  showCityPicker.value = false
}

const openCityPicker = () => { showCityPicker.value = true }
const openAttractionSelect = () => { router.push('/attraction-select') }
const applySelectedDestination = () => {
  const spot = sessionStorage.getItem('selected_destination_spot')
  if (!spot) return
  destination.value = spot
  sessionStorage.removeItem('selected_destination_spot')
}

/* ==================== 城市选择器滚轮 ==================== */
const wheelGesture = new WeakMap()
const dispatchTouch = (el, type, x, y) => {
  const touch = new Touch({ identifier: 0, target: el, clientX: x, clientY: y })
  el.dispatchEvent(new TouchEvent(type, { cancelable: true, bubbles: true, touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }))
}

const handlePickerWheel = (e) => {
  e.preventDefault(); e.stopPropagation()
  if (!(window.TouchEvent && typeof Touch === 'function')) return
  const picker = document.querySelector('.van-popup .van-picker')
  if (!picker) return
  const columns = picker.querySelectorAll('.van-picker-column')
  if (columns.length === 0) return
  const col = Array.from(columns).find(c => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right }) || columns[0]
  if (!col) return
  const r = col.getBoundingClientRect()
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2
  const itemHeight = 44
  let st = wheelGesture.get(col)
  if (!st) { dispatchTouch(col, 'touchstart', cx, cy); st = { targetY: 0, currentY: 0, timer: null, rafId: 0, animating: false }; wheelGesture.set(col, st) }
  st.targetY -= Math.sign(e.deltaY) * itemHeight
  if (!st.animating) {
    st.animating = true
    const animate = () => {
      const diff = st.targetY - st.currentY
      if (Math.abs(diff) > 0.5) { st.currentY += diff * 0.35; dispatchTouch(col, 'touchmove', cx, cy + st.currentY); st.rafId = requestAnimationFrame(animate) }
      else { st.currentY = st.targetY; dispatchTouch(col, 'touchmove', cx, cy + st.currentY); st.animating = false }
    }
    st.rafId = requestAnimationFrame(animate)
  }
  clearTimeout(st.timer)
  st.timer = setTimeout(() => { if (st.rafId) cancelAnimationFrame(st.rafId); st.currentY = st.targetY; dispatchTouch(col, 'touchmove', cx, cy + st.currentY); dispatchTouch(col, 'touchend', cx, cy + st.currentY); wheelGesture.delete(col) }, 320)
}

let wheelTimer = null  // BUGID L-HOME-3 修复：setTimeout 句柄，弹窗关闭时取消挂载任务
const addWheelListeners = () => {
  clearTimeout(wheelTimer)  // 重复打开时先取消上一次未执行的挂载任务
  wheelTimer = setTimeout(() => {
    // BUGID FEAT-5 修复：用组件自身 popup 的 id 精确定位，不再全局抓取第一个 .van-popup
    const popup = document.getElementById('city-picker-popup')
    if (popup) { const picker = popup.querySelector('.van-picker'); if (picker) { const handler = (e) => handlePickerWheel(e); popup.addEventListener('wheel', handler, { passive: false }); wheelHandlers.value.push({ column: popup, handler }) } }
  }, 500)
}

const removeWheelListeners = () => {
  clearTimeout(wheelTimer); wheelTimer = null  // BUGID L-HOME-3 修复：关闭时取消未执行的挂载，避免挂到残留 popup
  wheelHandlers.value.forEach(({ column, handler }) => column.removeEventListener('wheel', handler))
  wheelHandlers.value = []
}
watch(showCityPicker, (newVal) => {
  if (newVal) addWheelListeners()
  else removeWheelListeners()
})

/* ==================== 滚动触底加载（和社区页一致） ==================== */
const { trigger: topbarTrigger, visible: homeTopbarVisible, update: updateHomeTopbar } = useStickyAfterTrigger()

const handleScroll = () => {
  updateHomeTopbar()
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = window.innerHeight
  // BUGID PAGE-1 修复：首屏加载中或翻页中不触发，避免重复拉页
  if (scrollHeight - scrollTop - clientHeight < 200 && hasMore.value && !loadingMore.value && !notesLoading.value) {
    loadNotes()
  }
}

let hasLoadedOnce = false

onMounted(async () => {
  await loadStaticImageMap()
  loadHotDestinations(); loadExperiences()
  loadNotes(true).then(() => { hasLoadedOnce = true })
  applySelectedDestination()
  loadMyPlans()
})

onActivated(() => {
  applySelectedDestination()
  loadMyPlans()
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onDeactivated(() => {
  removeWheelListeners()
  window.removeEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="page-shell">

    <!-- 漂浮云朵粒子 — 已禁用（GPU消耗过高） -->

    <header class="home-topbar" :class="{ visible: homeTopbarVisible }" :aria-hidden="!homeTopbarVisible" :inert="!homeTopbarVisible">
      <button type="button" class="home-topbar-search" @click="goAttractionSearch()">
        <van-icon name="search" size="18" />
        <span>{{ t('attraction.searchPlaceholder') }}</span>
      </button>
      <nav class="home-topbar-actions" :aria-label="t('home.services')">
        <button v-for="tab in quickTabs" :key="tab.name" type="button" class="home-topbar-action" @click="handleQuickTab(tab)">
          <van-icon :name="tab.icon" size="18" />
          <span>{{ tab.shortName }}</span>
        </button>
      </nav>
    </header>

    <!-- ==================== LAYER 1: Hero Header ==================== -->
    <div class="hero-header entrance-item entrance-d1">
      <img
        class="hero-bg-img"
        :src="heroImage"
        alt=""
        @error="onCoverError"
      />
      <div class="hero-overlay"></div>
      <div class="hero-text-area">
        <h1 class="hero-title">旅迹</h1>
        <p class="hero-tagline">{{ t('home.heroTagline') }}</p>
      </div>
    </div>

    <section class="planner-card" aria-labelledby="planner-title">
      <div class="planner-eyebrow">
        <span class="planner-badge"><van-icon name="guide-o" size="14" /> AI TRIP PLANNER</span>
        <span class="planner-kicker">{{ t('home.plannerKicker') }}</span>
      </div>
      <h2 id="planner-title">{{ t('home.plannerHeadline') }}</h2>
      <p class="planner-description">{{ t('home.plannerDescription') }}</p>
      <div class="planner-features">
        <span><van-icon name="location-o" /> {{ t('home.plannerRoute') }}</span>
        <span><van-icon name="calendar-o" /> {{ t('home.plannerSchedule') }}</span>
        <span><van-icon name="balance-o" /> {{ t('home.plannerBudget') }}</span>
      </div>
      <button type="button" class="planner-cta" @click="goToAgentPlanner">{{ t('home.startPlanning') }} <van-icon name="arrow" size="16" /></button>
      <div v-if="latestPlan" class="saved-plan">
        <button type="button" class="saved-plan-link" @click="openLatestPlan">
          <span><span class="saved-plan-label">{{ t('home.continuePlan') }}</span>{{ planMeta }}</span><van-icon name="arrow" />
        </button>
        <button v-if="visiblePlanCards.length" type="button" class="plan-preview" :class="'n-' + visiblePlanCards.length" :aria-label="t('home.continuePlan')" @click="openLatestPlan">
          <span v-for="card in visiblePlanCards" :key="card.day + card.name" class="plan-photo">
            <img :src="card.image" :alt="card.name" class="plan-photo-img" loading="lazy" decoding="async" @error="onPlanImgError(card.name)" />
            <span v-if="card.day" class="plan-photo-day">{{ card.day }}</span><span class="plan-photo-name">{{ card.name }}</span>
          </span>
        </button>
      </div>
    </section>

    <section class="section-card travel-services" :aria-label="t('home.services')">
      <button type="button" class="spot-search-bar" @click="goAttractionSearch()">
        <van-icon name="search" size="18" /><span class="spot-search-ph">{{ t('attraction.searchPlaceholder') }}</span><van-icon name="arrow" size="12" />
      </button>
      <span ref="topbarTrigger" class="home-topbar-trigger" aria-hidden="true" />
      <div class="spot-search-tags">
        <button v-for="tag in spotSearchTags.slice(0, 4)" :key="tag" type="button" class="spot-search-tag" @click="goAttractionTag(tag)">{{ tag }}</button>
      </div>
      <div class="service-grid">
        <button v-for="item in serviceRow1" :key="item.key" type="button" class="service-item" @click="handleServiceClick(item)">
          <span class="service-icon-circle"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg></span>
          <span class="service-label">{{ t('home.serviceItems.' + item.key) }}</span>
        </button>
        <button type="button" class="service-item" @click="showMoreProducts = true">
          <span class="service-icon-circle"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg></span>
          <span class="service-label">{{ t('home.moreServices') }}</span>
        </button>
      </div>
    </section>

    <section class="dest-section" aria-labelledby="destinations-title">
      <div class="sec-head">
        <div><h2 id="destinations-title" class="sec-title">{{ t('home.hotDestinations') }}</h2><p class="sec-caption">{{ t('home.destinationCaption') }}</p></div>
        <button type="button" class="sec-more" @click="goToDestinations">{{ t('common.viewAll') }} <van-icon name="arrow" size="12" /></button>
      </div>
      <div class="h-scroll">
        <button v-for="d in hotDestinations" :key="d.name" type="button" class="dest-card" @click="handleDestination(d)">
          <img :src="d.image" :alt="d.name" class="dest-img" loading="lazy" decoding="async" @error="onCoverError" />
          <span class="dest-mask" /><span class="dest-name">{{ d.name }}</span><span v-if="d.tag" class="dest-tag">{{ d.tag }}</span>
        </button>
      </div>
    </section>

    <section class="ctrip-section" aria-labelledby="inspiration-title">
      <div class="sec-head">
        <div><h2 id="inspiration-title" class="sec-title">{{ t('home.inspirationTitle') }}</h2><p class="sec-caption">{{ t('home.inspirationCaption') }}</p></div>
        <button type="button" class="sec-more" @click="goToCommunity">{{ t('common.viewAll') }} <van-icon name="arrow" size="12" /></button>
      </div>
      <div class="ctrip-feed">
        <div v-for="(column, columnIndex) in noteColumns" :key="columnIndex" class="ctrip-feed-column">
        <div v-if="columnIndex === 0" class="ctrip-promotion-card" role="region" aria-roledescription="carousel" :aria-label="t('home.inspirationTitle')">
          <Swipe class="ctrip-promo-swipe" :autoplay="3000" indicator-color="#fff" :circular="true">
            <SwipeItem v-for="slide in promotionSlides" :key="slide.title">
              <div class="ctrip-promo-slide">
                <img :src="slide.image" :alt="t(slide.title)" class="ctrip-promo-img" loading="lazy" decoding="async" @error="onCoverError" />
                <div class="ctrip-promo-mask" />
                <span class="ctrip-promo-tag">{{ t(slide.tag) }}</span>
                <div class="ctrip-promo-copy">
                  <h3>{{ t(slide.title) }}</h3>
                  <p>{{ t(slide.subtitle) }}</p>
                </div>
              </div>
            </SwipeItem>
          </Swipe>
        </div>
        <template v-if="notesLoading">
        <div v-for="i in 2" :key="i" class="ctrip-skeleton-card" aria-hidden="true"><div class="ctrip-sk-image"></div><div class="ctrip-sk-info"><van-skeleton :row="2" /></div></div>
        </template>
        <template v-else>
        <article v-for="note in column" :key="note.id" class="ctrip-note-card" role="link" tabindex="0" :aria-label="note.title || note.content" @click="goToDetail(note)" @keydown.enter="goToDetail(note)">
          <div class="ctrip-card-image-wrapper">
            <img v-if="getNoteCoverImage(note)" :src="getNoteCoverImage(note)" :alt="note.title || note.tag" class="ctrip-card-main-img" loading="lazy" decoding="async" @error="onCoverError" />
            <video v-else-if="note.hasVideo && note.videoUrl" :src="note.videoUrl" class="ctrip-card-main-img" preload="metadata" muted playsinline @loadedmetadata="e => { e.target.currentTime = 0.1 }" @seeked="e => e.target.pause()" />
            <img v-else :src="coverPlaceholder" alt="" class="ctrip-card-main-img" loading="lazy" />
            <span v-if="note.hasVideo" class="ctrip-video-play-overlay"><van-icon name="play" size="16" color="white" /></span>
            <span v-if="note.tag" class="ctrip-card-tag">{{ note.tag }}</span>
          </div>
          <div class="ctrip-card-body">
            <div class="ctrip-card-title" :title="note.title || note.content">{{ note.title || note.content }}</div>
            <div class="ctrip-card-footer">
              <div class="ctrip-card-author"><van-image round width="18" height="18" :src="note.author.avatar" fit="cover" /><span>{{ note.author.nickname }}</span></div>
              <span class="ctrip-card-views"><van-icon name="eye-o" size="12" /><span>{{ formatNumber(note.viewCount) }}</span></span>
            </div>
          </div>
        </article>
        </template>
        </div>
      </div>
      <EmptyState v-if="empty" :title="t('home.noStories')" icon="photo-o" />
      <div class="ctrip-feed-footer">
        <div v-if="loadingMore" class="ctrip-loading-more"><van-loading size="20" color="#8B5CF6" /><span>{{ t('common.loading') }}</span></div>
        <div v-else-if="!hasMore && notes.length > 0" class="ctrip-no-more">— {{ t('common.noMore') }} —</div>
      </div>
    </section>

    <Transition name="fab-pop">
      <button v-if="!showAIChat && !showMoreProducts && !showCityPicker" type="button" class="fab-ai-btn" :aria-label="t('home.askAI')" @click="goToAIChat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /><path d="M20 2v4M18 4h4" /></svg>
        <span>{{ t('home.askAI') }}</span>
      </button>
    </Transition>

    <!-- ==================== AIChatDialog ==================== -->
    <AIChatDialog
      v-model:visible="showAIChat"
      :context-query="{ destination: destination.trim(), budget: budget.trim(), days: days.trim() }"
    />

    <!-- ==================== 更多产品 VanPopup ==================== -->
    <van-popup v-model:show="showMoreProducts" position="bottom" round safe-area-inset-bottom :style="{ maxHeight: '60vh' }">
      <div class="more-popup-header">
        <span class="more-popup-title">{{ t('home.moreServices') }}</span>
        <van-icon name="cross" size="20" color="var(--text-hint)" @click="showMoreProducts = false" />
      </div>
      <div class="more-popup-grid">
        <div
          v-for="(item, idx) in serviceRow2"
          :key="'ms-' + idx"
          class="more-popup-item"
          :class="{ pending: !item.ready }"
          @click="handleServiceClick(item)"
        >
          <div class="more-popup-icon" :class="item.ready ? 'is-ready' : 'is-pending'">
            <van-icon :name="item.icon" :color="item.ready ? '#8B5CF6' : '#94A3B8'" size="22" />
          </div>
          <span class="more-popup-label">{{ t('home.serviceItems.' + item.key) }}</span>
          <span v-if="!item.ready" class="service-soon">{{ t('home.comingSoon') }}</span>
        </div>
        <div
          v-for="(product, idx) in moreProductList"
          :key="'mp-' + idx"
          class="more-popup-item pending"
          @click="handleMoreProductClick"
        >
          <div class="more-popup-icon is-pending">
            <van-icon :name="product.icon" color="#94A3B8" size="22" />
          </div>
          <span class="more-popup-label">{{ t('home.products.' + product.key) }}</span>
          <span class="service-soon">{{ t('home.comingSoon') }}</span>
        </div>
      </div>
    </van-popup>

    <!-- ==================== 城市选择器 ==================== -->
    <van-popup id="city-picker-popup" v-model:show="showCityPicker" position="bottom" round safe-area-inset-bottom>
      <van-area ref="cityAreaRef" :title="t('home.selectCity')" :columns-num="2" :area-list="areaList" @confirm="onCityConfirm" @cancel="showCityPicker = false" />
    </van-popup>
  </div>
</template>

<style scoped>
/* ==================== CSS Variables ==================== */
.page-shell {
  --primary: #8B5CF6;
  --primary-2: #6366F1;
  --primary-3: #5B8DEF;
  --card-bg: rgba(255, 255, 255, 0.58);
  --card-radius: 18px;
  --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  --tabbar-height: 56px;
  --safe-area-bottom: 0px;
  --float-bar-height: 52px;
  --float-bar-gap: 8px;

  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  min-height: 100vh;
  background: transparent;
  padding-bottom: calc(10px + 48px + 60px + var(--safe-area-bottom, 0px));
}

/* ==================== LAYER 1: Hero — 山水大图卡片 ==================== */
.page-shell button {
  font-family: inherit;
  cursor: pointer;
}
.page-shell button:focus-visible,
.ctrip-note-card:focus-visible {
  outline: 3px solid #8b5cf6;
  outline-offset: 4px;
}
.home-topbar {
  position: fixed;
  top: 0;
  left: 50%;
  z-index: 1000;
  width: min(100%, 720px);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: calc(env(safe-area-inset-top, 0px) + 7px) 8px 7px;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-50%, -100%, 0);
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
}
.home-topbar.visible { opacity: 1; pointer-events: auto; transform: translate3d(-50%, 0, 0); }
.home-topbar-search {
  flex: 1 1 96px;
  min-width: 82px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 20px;
  background: #f3f1f6;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.home-topbar-search span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-topbar-actions { flex: 0 1 240px; min-width: 210px; display: grid; grid-template-columns: repeat(6, minmax(34px, 1fr)); }
.home-topbar-action { min-width: 0; padding: 1px 0; border: 0; background: transparent; color: #7c3aed; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 9px; line-height: 1.1; }
.home-topbar-action:nth-child(2) { color: #6366f1; }
.home-topbar-action:nth-child(3) { color: #0ea5e9; }
.home-topbar-action:nth-child(4) { color: #f59e0b; }
.home-topbar-action:nth-child(5) { color: #b45309; }
.home-topbar-action:nth-child(6) { color: #f97316; }
.home-topbar-trigger { display: block; width: 1px; height: 1px; }
html[data-theme='dark'] .home-topbar { background: rgba(24, 27, 40, 0.9); border-bottom-color: rgba(255,255,255,0.06); }
html[data-theme='dark'] .home-topbar-search { background: rgba(255,255,255,0.08); }
.planner-card {
  position: relative;
  z-index: 2;
  margin: -22px 16px 16px;
  padding: 22px;
  border: 1px solid #e8ddfb;
  border-radius: 24px;
  background: linear-gradient(130deg, #fff 20%, #f3edff);
  box-shadow: 0 8px 28px rgba(83, 47, 142, 0.08);
}
.planner-eyebrow, .planner-features, .saved-plan-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.planner-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7445c0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
}
.planner-kicker { font-size: 11px; color: var(--text-secondary); }
#planner-title { margin: 14px 0 8px; font-size: 25px; line-height: 1.35; letter-spacing: -0.5px; color: var(--text-primary); }
.planner-description { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
.planner-features { justify-content: flex-start; flex-wrap: wrap; gap: 10px 18px; margin: 16px 0 20px; color: #6e5b87; font-size: 12px; }
.planner-features span { display: inline-flex; align-items: center; gap: 4px; }
.page-shell .planner-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 12px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(110deg, #8755e7, #7040ca);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 5px 12px rgba(112, 64, 202, 0.18);
  transition: transform 0.2s;
}
.planner-cta:active { transform: scale(0.98); }
.saved-plan { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(139, 92, 246, 0.15); }
.saved-plan-link { width: 100%; padding: 0 0 12px; border: 0; background: none; text-align: left; font-size: 12px !important; }
.saved-plan-label { display: block; margin-bottom: 4px; font-weight: 600; color: #7445c0; }
.saved-plan .plan-preview { width: 100%; border: 0; padding: 0; background: none; height: 110px; }
.travel-services.section-card { margin: 0 16px 26px; padding: 16px; background: var(--bg-card-solid, #fff); border: 1px solid rgba(139, 92, 246, 0.06); box-shadow: none; }
.travel-services .spot-search-bar { width: 100%; height: 44px; border: 1px solid rgba(139, 92, 246, 0.1); background: #f7f5fb; color: #817294; border-radius: 12px; text-align: left; }
.travel-services .spot-search-ph { color: var(--text-secondary); font-size: 13px; }
.travel-services .spot-search-tags { gap: 6px; margin-top: 8px; }
.travel-services .spot-search-tag { border: 0; background: none; padding: 4px 8px; min-height: 28px; color: var(--text-secondary); font-size: 11px; }
.travel-services .service-grid { padding: 16px 0 0; margin-top: 10px; border-top: 1px solid rgba(139, 92, 246, 0.08); gap: 10px; }
.service-item { padding: 0; border: 0; background: none; min-width: 0; }
.service-icon-circle { background: #f1ebfa; color: #8053bb; }
.service-icon-circle svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.sec-head .sec-title { margin: 0; font-size: 18px; line-height: 1.4; }
.sec-caption { margin: 5px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.page-shell .sec-more { min-height: 40px; padding: 0; border: 0; background: none; color: #756781; font-size: 12px; white-space: nowrap; }
.dest-section .h-scroll { padding-right: 16px; padding-bottom: 8px; scroll-snap-type: x proximity; }
.dest-section .dest-card { padding: 0; border: 0; text-align: left; scroll-snap-align: start; width: 145px; height: 180px; border-radius: 16px; }
.dest-section .dest-name { font-size: 20px; }
.ctrip-section { margin-top: 22px; }
.ctrip-note-card { border: 1px solid rgba(139, 92, 246, 0.06); }
.ctrip-card-footer { color: var(--text-secondary); }
html[data-theme='dark'] .planner-card { background: linear-gradient(130deg, #242034, #2d2340); border-color: #49325f; }
html[data-theme='dark'] .planner-badge,
html[data-theme='dark'] .planner-features,
html[data-theme='dark'] .saved-plan-label,
html[data-theme='dark'] .sec-more { color: #c4b5fd; }
html[data-theme='dark'] .service-icon-circle { background: #352a46; color: #c4b5fd; }
@media (max-width: 360px) {
  .planner-card { padding: 18px; }
  #planner-title { font-size: 23px; }
  .planner-features { gap: 10px; font-size: 11px; }
  .planner-kicker { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .page-shell *, .page-shell *::before, .page-shell *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}

.hero-header {
  position: relative;
  height: 190px;
  margin: 0;
  border-radius: 0 0 22px 22px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}

.hero-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0.22) 0%,
    rgba(0,0,0,0.02) 38%,
    rgba(0,0,0,0.16) 70%,
    rgba(0,0,0,0.42) 100%
  );
  pointer-events: none;
  z-index: 1;
}

.hero-text-area {
  position: absolute;
  left: 16px;
  bottom: 38px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.hero-title {
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
  margin: 0 0 6px;
  letter-spacing: 2px;
  text-shadow: 0 2px 10px rgba(0,0,0,0.35);
}

.hero-tagline {
  font-size: 12px;
  font-weight: 400;
  color: rgba(255,255,255,0.86);
  margin: 0;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.3);
}

.hero-actions-right {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 2;
  display: flex;
  gap: 8px;
}

.hero-glass-btn-right {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  border: 0.5px solid rgba(255,255,255,0.18);
  border-radius: 20px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15);
  transition: background 0.2s, transform 0.15s;
}
.hero-glass-btn-right:active {
  background: rgba(0, 0, 0, 0.45);
  transform: scale(0.94);
}

.spot-search-bar {
  display: flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 12px;
  border: 1.5px solid #8B5CF6; border-radius: 20px; background: #f8f5ff;
}
.spot-search-ph { flex: 1; min-width: 0; font-size: 14px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-entry { cursor: pointer; }
.plan-entry .plan-header { margin-bottom: 12px; }
.plan-entry .plan-header-text { flex: 1; }
.plan-preview {
  display: grid;
  gap: 6px;
  height: 148px;
}
.plan-preview.n-1 { grid-template-columns: 1fr; }
.plan-preview.n-2 { grid-template-columns: 1.35fr 1fr; }
.plan-preview.n-3 {
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.plan-preview.n-3 .plan-photo:first-child { grid-row: span 2; }
.plan-photo {
  min-width: 0;
  min-height: 0;
  position: relative;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #c4b5fd, #7c3aed);
}
.plan-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.plan-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 42%, rgba(0,0,0,0.55));
  pointer-events: none;
}
.plan-photo-day {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255,255,255,0.92);
  color: #7c3aed;
  font-size: 10px;
  font-weight: 700;
}
.plan-photo-name {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  z-index: 1;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.spot-search-tags {
  display: flex; gap: 8px; overflow-x: auto; margin-top: 10px;
  scrollbar-width: none;
}
.spot-search-tags::-webkit-scrollbar { display: none; }
.spot-search-tag {
  flex-shrink: 0; padding: 5px 12px; background: #f1f5f9; border-radius: 14px;
  font-size: 12px; color: #475569;
}

/* ==================== 统一卡片容器 ==================== */
.section-card {
  margin: 0 12px 12px;
  padding: 16px;
  background:
    linear-gradient(160deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.12) 35%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.3) 100%),
    rgba(255,255,255,0.55);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 2px 12px rgba(0,0,0,0.03);
  border: 1px solid rgba(255,255,255,0.65);
}

/* ==================== 服务入口：双行 5 列 ==================== */
.service-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px 4px;
  padding: 4px 0 12px;
}

.service-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.2s;
}
.service-item:active { transform: scale(0.92); }

.service-icon-circle {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
}
.service-icon-circle.is-ready { background: rgba(139, 92, 246, 0.12); }
.service-icon-circle.is-more,
.service-icon-circle.is-pending { background: rgba(148, 163, 184, 0.12); }
.service-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}
.service-soon {
  font-size: 9px;
  color: #94a3b8;
  line-height: 1.1;
}

/* ==================== 更多产品入口条 ==================== */
.more-products-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 0;
  margin-top: 2px;
  border-top: 1px solid rgba(0,0,0,0.04);
  cursor: pointer;
  transition: opacity 0.15s;
}
.more-products-bar:active { opacity: 0.6; }
.more-products-left { display: flex; align-items: center; gap: 10px; }
.mini-icon-row { display: flex; }
.mini-icon {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px;
  font-size: 10px; font-weight: 700;
  margin-right: -4px;
  border: 2px solid #fff;
}
.more-products-text { font-size: 12px; color: var(--text-hint); font-weight: 500; }

/* ==================== 横向滚动容器 ==================== */
.h-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.h-scroll::-webkit-scrollbar { display: none; }

.plan-card {
  margin: 12px 12px 0 !important;
  padding: 16px !important;
  background:
    linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 35%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.65) 100%),
    rgba(255,255,255,0.65);
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
  border-radius: 20px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.65),
    0 2px 16px rgba(0,0,0,0.04);
  border: 1px solid rgba(255,255,255,0.65);
}
.plan-search-ph {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text-hint);
  padding: 10px 0;
}
.plan-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.plan-icon-wrap {
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #ede9fe, #ddd6fe);
  border-radius: 14px;
  font-size: 20px;
  flex-shrink: 0;
}
.plan-header-text {
  display: flex;
  flex-direction: column;
}
.plan-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}
.plan-subtitle {
  font-size: 12px;
  color: var(--text-hint);
  margin-top: 1px;
}

.plan-search-row {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border-radius: 14px;
  padding: 2px 4px 2px 14px;
  margin-bottom: 8px;
  border: 1.5px solid rgba(255,255,255,0.55);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
  transition: border-color 0.3s, box-shadow 0.3s;
  position: relative;
}
.plan-search-row:focus-within {
  border-color: rgba(139,92,246,0.5);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55),
    0 0 0 3px rgba(139,92,246,0.08),
    0 0 20px rgba(139,92,246,0.1);
  animation: borderGlow 2s ease-in-out infinite;
}
@keyframes borderGlow {
  0%, 100% { border-color: rgba(139,92,246,0.4); }
  50%      { border-color: rgba(167,139,250,0.7); }
}
.plan-search-wrap {
  flex: 1; min-width: 0;
}
.plan-search-wrap :deep(.edge-wrap) {
  background: transparent;
  padding: 6px 0;
  border-radius: 0;
  box-shadow: none;
}
.plan-search-wrap :deep(.edge-inp) {
  font-size: 14px;
  color: var(--text-primary);
}
.plan-search-wrap :deep(.edge-inp::placeholder) {
  color: var(--text-hint);
}
.plan-loc-btn {
  flex-shrink: 0;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: none;
  background: rgba(139,92,246,0.08);
  border-radius: 10px;
  cursor: pointer;
  margin-left: 4px;
}

/* 热门目的地标签 */
.hot-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.hot-tags::-webkit-scrollbar { display: none; }
.hot-tag {
  flex-shrink: 0;
  padding: 7px 14px;
  background: rgba(255,255,255,0.6);
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.55);
  border-radius: 14px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}
.hot-tag.active {
  background: #7C3AED;
  color: #fff;
  border-color: #7C3AED;
  box-shadow: 0 2px 8px rgba(124,58,237,0.25);
}
.hot-tag:active { transform: scale(0.95); }

/* 预算/天数/人数 — 三个独立椭圆玻璃框 */
.plan-meta-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.plan-meta-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 11px 6px;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  border: 1.5px solid rgba(255,255,255,0.55);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.plan-meta-item:focus-within {
  border-color: rgba(139,92,246,0.5);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55),
    0 0 0 3px rgba(139,92,246,0.08),
    0 0 20px rgba(139,92,246,0.1);
  animation: borderGlow 2s ease-in-out infinite;
}
.plan-meta-item.filled {
  border-color: rgba(139,92,246,0.25);
}
.plan-meta-label {
  font-size: 12px;
  color: var(--text-hint);
  flex-shrink: 0;
}
.plan-meta-input {
  width: 32px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  padding: 0;
}
.plan-meta-input::placeholder {
  color: #CBD5E1;
  font-weight: 400;
  font-size: 13px;
}
.plan-meta-unit {
  font-size: 11px;
  color: var(--text-hint);
  font-weight: 500;
}

/* 提交按钮 */
.plan-submit {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #8B5CF6, #6366F1);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
  transition: transform 0.18s;
  letter-spacing: 0.5px;
}
.plan-submit:active { transform: scale(0.97); }

/* ==================== 通用区块头 ==================== */
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sec-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.sec-more { font-size: 12px; color: var(--text-hint); cursor: pointer; display: flex; align-items: center; gap: 2px; }
.sec-more:active { opacity: 0.6; }

/* ==================== 热门目的地卡片 ==================== */
.dest-section {
  margin: 8px 0 16px;
  padding-left: 16px;
}
.dest-section .sec-head {
  padding-right: 16px;
}
.dest-card {
  flex-shrink: 0; width: 152px; height: 200px; border-radius: 18px;
  overflow: hidden; position: relative; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
.dest-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dest-mask { position: absolute; inset: 0; background: linear-gradient(transparent 40%, rgba(0,0,0,0.58)); }
.dest-name {
  position: absolute; bottom: 12px; left: 12px; right: 12px;
  font-size: 20px; font-weight: 800; color: #fff;
  text-shadow: 0 1px 8px rgba(0,0,0,0.4);
}
.dest-tag {
  position: absolute; top: 10px; left: 10px;
  font-size: 10px; font-weight: 600; color: #fff;
  background: rgba(0,0,0,0.32);
  padding: 3px 8px;
  border-radius: 8px;
}

/* ==================== 骨架屏 ==================== */
.skeleton-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(139, 92, 246, 0.06);
}
.sk-img-wrap {
  width: 100%;
  height: 95px;
}
.sk-img {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
.sk-body {
  padding: 12px;
}
.sk-row {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  margin-bottom: 8px;
}
.sk-row:last-child {
  margin-bottom: 0;
}
.sk-row-title {
  width: 70%;
  height: 14px;
}
.sk-row-desc {
  width: 85%;
}
.sk-row-meta {
  width: 60%;
  height: 10px;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ==================== 携程风格：优质游记（复刻社区功能） ==================== */
.ctrip-section {
  width: 100%;
  margin: 0 auto 14px;
  padding: 0 16px;
  box-sizing: border-box;
  background: transparent;
}

/* 标题栏 */
.ctrip-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 12px;
}
.ctrip-section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}
.ctrip-section-more {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 导航筛选栏 */
.ctrip-nav-filter {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 10px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.06);
}

.ctrip-nav-filter .ctrip-city-selector {
  display: flex; align-items: center; gap: 5px;
  background: #f8fafc; border-radius: 16px; padding: 8px 12px;
  flex-shrink: 0; cursor: pointer; transition: all 0.2s ease;
}

.ctrip-nav-filter .ctrip-city-selector:active { transform: scale(0.96); background: #f1f5f9; }
.ctrip-nav-filter .ctrip-city-text { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.ctrip-nav-filter .ctrip-center-tabs {
  flex: 1; display: flex; justify-content: center; gap: 6px;
  background: #f8fafc; border-radius: 16px; padding: 4px;
}
.ctrip-nav-filter .ctrip-tab-chip {
  flex: 1; text-align: center; padding: 6px 0; border-radius: 13px;
  font-size: 13px; font-weight: 500; color: var(--text-secondary);
  cursor: pointer; transition: all 0.3s ease; user-select: none;
}
.ctrip-nav-filter .ctrip-tab-chip.active {
  background: linear-gradient(135deg, #8B5CF6, #6366F1);
  color: #fff; box-shadow: 0 3px 10px rgba(139, 92, 246, 0.3);
}
.ctrip-nav-filter .ctrip-search-btn {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; background: #f8fafc; border-radius: 16px;
  flex-shrink: 0; cursor: pointer; transition: all 0.2s ease;
}
.ctrip-nav-filter .ctrip-search-btn:active { transform: scale(0.92); }

/* 笔记 Feed - 双列瀑布流 */
.ctrip-feed {
  padding: 0 0 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ctrip-feed-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 首页特色轮播：保留原有三张内容及三秒自动切换。 */
.ctrip-promotion-card {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 12px;
  background: #e8e0f2;
}
.ctrip-promo-swipe { position: absolute; inset: 0; height: 100%; }
.ctrip-promo-slide { position: relative; width: 100%; height: 100%; }
.ctrip-promo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ctrip-promo-mask { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.08), transparent 35%, rgba(0,0,0,0.7)); }
.ctrip-promo-tag { position: absolute; top: 10px; left: 10px; right: 10px; width: fit-content; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,0.94); color: #6c40a5; font-size: 10px; font-weight: 600; }
.ctrip-promo-copy { position: absolute; left: 12px; right: 12px; bottom: 26px; color: #fff; }
.ctrip-promo-copy h3 { margin: 0 0 6px; font-size: 17px; line-height: 1.4; }
.ctrip-promo-copy p { margin: 0; font-size: 11px; line-height: 1.6; color: rgba(255,255,255,0.92); }

@property --fab-glow-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes fab-border-flow {
  to { --fab-glow-angle: 360deg; }
}
.fab-ai-btn {
  position: fixed;
  right: max(16px, calc((100vw - 720px) / 2 + 16px));
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  padding: 0 15px;
  border: 1px solid rgba(255,255,255,0.58);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255,255,255,0.46), rgba(243,232,255,0.12)), rgba(255,255,255,0.18);
  color: #632bb1;
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 4px 20px rgba(88,49,147,0.18), 0 0 16px rgba(168,85,247,0.24);
  transition: transform 0.2s;
}
.fab-ai-btn::before,
.fab-ai-btn::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(from var(--fab-glow-angle), rgba(139,92,246,0.15), #a855f7 18%, #e9d5ff 25%, rgba(139,92,246,0.12) 38%, rgba(139,92,246,0.12) 55%, #7c3aed 72%, #d8b4fe 80%, rgba(139,92,246,0.15));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  animation: fab-border-flow 3s linear infinite;
}
.fab-ai-btn::after { inset: -5px; padding: 5px; opacity: 0.35; filter: blur(3px); }
.fab-ai-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.fab-ai-btn:active { transform: scale(0.96); }
.fab-pop-enter-active, .fab-pop-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fab-pop-enter-from, .fab-pop-leave-to { opacity: 0; transform: translateY(10px); }
html[data-theme='dark'] .fab-ai-btn { background: linear-gradient(135deg, rgba(95,69,128,0.42), rgba(38,28,56,0.18)); border-color: rgba(216,180,254,0.4); color: #eadcff; }

.ctrip-skeleton-card {
  background: #fff; border-radius: 12px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.ctrip-skeleton-card .ctrip-sk-image {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
.ctrip-sk-info { padding: 10px; }

/* 笔记卡片 */
.ctrip-note-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
}
.ctrip-note-card:active { transform: scale(0.97); }

/* 图片区域 - 自然宽高比错落 */
.ctrip-card-image-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 3 / 4;
  background: #ede9f5;
}
.ctrip-card-image-wrapper.aspect-3-4 { aspect-ratio: 3 / 4; }
.ctrip-card-image-wrapper.aspect-4-5 { aspect-ratio: 4 / 5; }
.ctrip-card-image-wrapper.aspect-1-1 { aspect-ratio: 1 / 1; }
.ctrip-card-image-wrapper.aspect-4-3 { aspect-ratio: 4 / 3; }
.ctrip-card-image-wrapper.aspect-3-2 { aspect-ratio: 3 / 2; }
.ctrip-card-image-wrapper.aspect-2-3 { aspect-ratio: 2 / 3; }
.ctrip-card-image-wrapper.aspect-5-3 { aspect-ratio: 5 / 3; }

.ctrip-card-main-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 视频播放按钮（叠在封面图右上角） */
.ctrip-video-play-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  backdrop-filter: blur(4px);
  z-index: 2;
}
.ctrip-card-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ctrip-card-placeholder::after {
  content: '📷';
  font-size: 28px;
  opacity: 0.4;
}

/* 图片标签（城市/种草标签） */
.ctrip-card-tag {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  z-index: 2;
}

/* 卡片内容 */
.ctrip-card-body {
  padding: 10px 10px 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ctrip-card-title {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 600;
}

/* 卡片底部（作者+浏览量） */
.ctrip-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

/* 作者信息 */
.ctrip-card-author {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.ctrip-card-author span {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 浏览量 */
.ctrip-card-views {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.ctrip-card-views span {
  font-size: 10px;
  color: var(--text-hint);
}

/* 加载更多 */
.ctrip-loading-more, .ctrip-no-more { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 20px 0; font-size: 13px; color: var(--text-hint); }
.ctrip-no-more { font-size: 12px; }

/* Vant 组件覆盖 */
.ctrip-comment-field :deep(.van-field__control) { font-size: 13px; color: #334155; }
.ctrip-comment-field :deep(.van-field__control::placeholder) { color: var(--text-hint); }
.ctrip-comment-field :deep(.van-cell) { padding: 0 !important; }
.ctrip-skeleton-card :deep(.van-skeleton) { padding: 6px 0; }

/* ==================== 美食玩乐 ==================== */
.exp-chip {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; background: #fff; border-radius: 25px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03); cursor: pointer;
  transition: transform 0.2s; font-size: 13px; color: #475569; font-weight: 500;
}
.exp-chip:active { transform: scale(0.95); }
.exp-chip-icon {
  width: 36px; height: 36px; display: flex; align-items: center;
  justify-content: center; border-radius: 10px;
}

/* ==================== More Products Popup ==================== */
.more-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 10px;
}

.more-popup-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.more-popup-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px 8px;
  padding: 10px 20px 30px;
  overflow-y: auto;
}

.more-popup-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.15s;
}
.more-popup-item:active {
  transform: scale(0.92);
}

.more-popup-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}
.more-popup-icon.is-ready { background: rgba(139, 92, 246, 0.12); }
.more-popup-icon.is-pending { background: rgba(148, 163, 184, 0.12); }
.more-popup-item.pending { opacity: 0.9; }

.more-popup-label {
  font-size: 11px;
  color: #475569;
  font-weight: 500;
  text-align: center;
}

/* ==================== Vant 覆盖 ==================== */
:deep(.van-swipe__indicators) { bottom: 14px; }
:deep(.van-swipe__indicator) { width: 6px; height: 6px; opacity: 0.5; }
:deep(.van-swipe__indicator--active) { width: 18px; border-radius: 3px; opacity: 1; }
:deep(.van-picker-column) { touch-action: pan-y; overflow-y: auto; }

/*
 * ================================================================
 * 首页专属动效（追加拿满，不动原有样式）
 * ================================================================
 */

/* ---------- 云端粒子层 ---------- */
.clouds-layer {
  position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
}
.cloud-dot {
  position: absolute; border-radius: 50%;
  background: rgba(139, 92, 246, 0.08);
  /* animation 已禁用 — 6个fixed粒子持续translate导致GPU过载 */
}
.c1 { width: 60px; height: 60px; top: 12%; left: 5%; animation-duration: 24s; animation-delay: 0s; }
.c2 { width: 40px; height: 40px; top: 25%; right: 10%; animation-duration: 30s; animation-delay: -6s; background: rgba(99,102,241,0.06); }
.c3 { width: 80px; height: 80px; top: 50%; left: 70%; animation-duration: 36s; animation-delay: -12s; }
.c4 { width: 30px; height: 30px; top: 65%; left: 15%; animation-duration: 20s; animation-delay: -3s; background: rgba(167,139,250,0.07); }
.c5 { width: 50px; height: 50px; top: 78%; right: 25%; animation-duration: 28s; animation-delay: -18s; }
.c6 { width: 35px; height: 35px; top: 40%; left: 35%; animation-duration: 22s; animation-delay: -9s; background: rgba(139,92,246,0.05); }

/* hero-header 不设 animation 避免覆盖 entrance-item 的 entranceUp */

/* ---------- 圆形图标常驻呼吸 + hover发光 ---------- */
.service-icon-circle {
  /* animation 已禁用 — 5个图标同时呼吸动画导致GPU持续负载 */
  transition: transform 0.35s ease, box-shadow 0.35s ease;
}
.service-item:hover .service-icon-circle {
  transform: scale(1.12);
  box-shadow: 0 0 20px rgba(139,92,246,0.2);
}

/* ---------- 活动卡片上下悬浮 ---------- */
.float-card {
  animation: floatUpDown 4s ease-in-out infinite;
  animation-delay: 0.8s; /* 等 entranceUp 播完再开始浮动 */
}

/* ---------- 底部AI悬浮栏麦克风脉冲 ---------- */
.float-mic-icon {
  animation: pulseGlow 2.2s ease-in-out infinite;
}

/* ---------- 输入框聚焦扫光（搜索栏） ---------- */
.search-row :deep(input):focus {
  background: linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.06) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: inputShimmer 2s ease-in-out infinite;
}

/* ---------- 热门目标卡片hover上浮 ---------- */
.dest-card {
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s ease;
}
.dest-card:hover { transform: translateY(-6px); box-shadow: 0 12px 28px rgba(0,0,0,0.10); }
.dest-card:active { transform: scale(0.95); }

/* ---------- 横向标签顺滑滚动缓冲 ---------- */
.city-tags, .h-scroll {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* ==================== Responsive ==================== */
@media (max-width: 375px) {
  .hero-title { font-size: 26px; }
  .service-grid {
    padding: 16px 10px 6px;
    gap: 10px 2px;
  }
  .service-grid-row2 {
    padding: 0 10px 12px;
    gap: 8px 2px;
  }
  .service-icon-circle {
    width: 44px;
    height: 44px;
  }
  .service-icon-circle-sm {
    width: 36px;
    height: 36px;
  }
  .service-label {
    font-size: 10px;
  }
  .service-label-sm {
    font-size: 9px;
  }
  .content-card {
    margin: 0 auto 12px;
    padding: 0 16px;
  }
  .quick-tabs-card {
    margin: 0 10px;
    padding: 8px 10px;
  }
  .dual-cards-scroll {
    padding: 14px 16px;
  }
  .event-card {
    width: 170px;
    height: 115px;
  }
  .city-card {
    width: 140px;
    height: 115px;
  }
  .ai-float-bar {
    max-width: 180px;
  }
}
/* ==================== 深色模式（B4） ==================== */
html[data-theme='dark'] .section-card {
  background: var(--bg-card);
  border-color: var(--glass-border);
  box-shadow: var(--shadow-md);
}
html[data-theme='dark'] .ctrip-note-card {
  background: var(--bg-card-solid);
  border-color: var(--glass-border);
  box-shadow: var(--shadow-md);
}
html[data-theme='dark'] .ctrip-card-title { color: var(--text-primary); }
html[data-theme='dark'] .ctrip-card-views,
html[data-theme='dark'] .event-title { color: var(--text-secondary); }
html[data-theme='dark'] .quick-item,
html[data-theme='dark'] .dest-card { background: var(--bg-card); }
html[data-theme='dark'] .plan-card {
  background: var(--bg-card);
  border-color: var(--glass-border);
}
html[data-theme='dark'] .plan-photo-day { background: rgba(30,27,46,0.88); color: #c4b5fd; }
html[data-theme='dark'] .spot-search-block { background: var(--bg-card); }
html[data-theme='dark'] .spot-search-bar { background: var(--bg-card-solid, #1e1b2e); border-color: var(--glass-border); }
html[data-theme='dark'] .spot-search-tag { background: rgba(255,255,255,0.06); color: var(--text-secondary); }
</style>
