/**
 * 景点本地兜底数据。对接真实 API 后可删，页面只走 api/attraction.js。
 */
const img = (name, fallback) => ({
  src: `/api/city/image?name=${encodeURIComponent(name)}`,
  fallback,
})

const U = {
  mountain: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  lake: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=1200&q=80',
  palace: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=1200&q=80',
  city: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=1200&q=80',
  waterfall: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=1200&q=80',
  forest: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80',
}

export const MOCK_ATTRACTIONS = [
  {
    id: 'bailong',
    name: '百龙天梯',
    city: '张家界',
    park: '张家界国家森林公园',
    heat: 7.2,
    rating: 4.3,
    reviewCount: 5531,
    listTitle: '入选湖南必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 65,
    hours: ['淡季 08:30-17:45', '旺季 07:30-18:00'],
    address: '湖南省张家界市武陵源区张家界国家森林公园内',
    phone: '0744-5618098',
    images: [img('张家界', U.mountain), img('天门山', U.forest), img('黄果树瀑布', U.waterfall)],
    notice: '建议预留 3–4 小时。雨雾天观景台可能临时关闭，以景区当日公告为准。请穿防滑鞋，高峰期排队较长。',
    nearby: ['tianmen', 'huangguoshu'],
    lat: 29.325, lng: 110.436,
  },
  {
    id: 'tianmen',
    name: '天门山',
    city: '张家界',
    park: '天门山国家森林公园',
    heat: 8.1,
    rating: 4.6,
    reviewCount: 12840,
    listTitle: '入选湖南必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 258,
    hours: ['07:30-16:00（索道）'],
    address: '湖南省张家界市永定区天门山国家森林公园',
    phone: '0744-8889999',
    images: [img('天门山', U.mountain), img('张家界', U.forest)],
    notice: '索道与玻璃栈道分时段检票，请预留交通时间。恐高者慎行玻璃栈道。',
    nearby: ['bailong'],
    lat: 29.05, lng: 110.48,
  },
  {
    id: 'west-lake',
    name: '西湖',
    city: '杭州',
    park: '西湖风景名胜区',
    heat: 9.4,
    rating: 4.8,
    reviewCount: 86221,
    listTitle: '入选浙江必打卡景点榜',
    onRank: true,
    ticketRequired: false,
    ticketFrom: 0,
    hours: ['全天开放'],
    address: '浙江省杭州市西湖区龙井路1号',
    phone: '0571-87179617',
    images: [img('西湖', U.lake), img('杭州', U.lake), img('灵隐寺', U.forest)],
    notice: '环湖免费开放。雷峰塔、灵隐飞来峰等为园中园另行购票。周末苏堤断桥人流较大。',
    nearby: ['lingyin'],
    lat: 30.25, lng: 120.15,
  },
  {
    id: 'lingyin',
    name: '灵隐寺',
    city: '杭州',
    park: '西湖风景名胜区',
    heat: 7.8,
    rating: 4.5,
    reviewCount: 21003,
    listTitle: '入选杭州人文景点榜',
    onRank: false,
    ticketRequired: true,
    ticketFrom: 45,
    hours: ['07:00-18:15'],
    address: '浙江省杭州市西湖区灵隐路法云弄1号',
    phone: '0571-87968665',
    images: [img('灵隐寺', U.forest), img('杭州', U.lake)],
    notice: '飞来峰与灵隐寺门票分开。请着装得体，寺内勿大声喧哗。',
    nearby: ['west-lake'],
    lat: 30.24, lng: 120.10,
  },
  {
    id: 'forbidden-city',
    name: '故宫',
    city: '北京',
    park: '故宫博物院',
    heat: 9.6,
    rating: 4.7,
    reviewCount: 152330,
    listTitle: '入选北京必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 60,
    hours: ['08:30-17:00（周一闭馆）'],
    address: '北京市东城区景山前街4号',
    phone: '010-85007421',
    images: [img('故宫', U.palace), img('北京', U.palace)],
    notice: '需实名预约。建议从午门入、神武门出。珍宝馆/钟表馆另购票。',
    nearby: ['temple-heaven'],
    lat: 39.916, lng: 116.397,
  },
  {
    id: 'temple-heaven',
    name: '天坛',
    city: '北京',
    park: '天坛公园',
    heat: 7.5,
    rating: 4.6,
    reviewCount: 33412,
    listTitle: '入选北京人文景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 15,
    hours: ['06:00-22:00（景点 08:00-17:00）'],
    address: '北京市东城区天坛路7号',
    phone: '010-67028866',
    images: [img('天坛', U.palace), img('北京', U.city)],
    notice: '联票含祈年殿、回音壁等。清晨有不少市民晨练，适合散步。',
    nearby: ['forbidden-city'],
    lat: 39.882, lng: 116.407,
  },
  {
    id: 'sayram',
    name: '赛里木湖',
    city: '博尔塔拉',
    park: '赛里木湖景区',
    heat: 8.6,
    rating: 4.7,
    reviewCount: 9812,
    listTitle: '入选新疆必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 145,
    hours: ['09:00-20:00（季节性）'],
    address: '新疆维吾尔自治区博尔塔拉蒙古自治州温泉县',
    phone: '0909-6221568',
    images: [img('赛里木湖', U.lake), img('天山', U.mountain)],
    notice: '湖区海拔较高，注意防晒与保暖。环湖自驾请遵守景区交通管制。',
    nearby: [],
    lat: 44.60, lng: 81.15,
  },
  {
    id: 'bund',
    name: '外滩',
    city: '上海',
    park: '黄浦江滨江步道',
    heat: 9.1,
    rating: 4.6,
    reviewCount: 67890,
    listTitle: '入选上海必打卡景点榜',
    onRank: true,
    ticketRequired: false,
    ticketFrom: 0,
    hours: ['全天开放'],
    address: '上海市黄浦区中山东一路',
    phone: '',
    images: [img('外滩', U.city), img('上海', U.city)],
    notice: '免费开放。夜景约 18:00 后更出片。周末人流大，注意保管随身物品。',
    nearby: [],
    lat: 31.24, lng: 121.49,
  },
  {
    id: 'terracotta',
    name: '兵马俑',
    city: '西安',
    park: '秦始皇兵马俑博物馆',
    heat: 9.2,
    rating: 4.7,
    reviewCount: 99012,
    listTitle: '入选陕西必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 120,
    hours: ['08:30-18:00（旺季）'],
    address: '陕西省西安市临潼区秦始皇帝陵博物院',
    phone: '029-81399111',
    images: [img('兵马俑', U.palace), img('西安', U.palace)],
    notice: '建议线上预约。一号坑最壮观，铜车马馆单独排队。参观约 2–3 小时。',
    nearby: [],
    lat: 34.385, lng: 109.278,
  },
  {
    id: 'huangguoshu',
    name: '黄果树瀑布',
    city: '安顺',
    park: '黄果树风景名胜区',
    heat: 8.0,
    rating: 4.5,
    reviewCount: 44120,
    listTitle: '入选贵州必打卡景点榜',
    onRank: true,
    ticketRequired: true,
    ticketFrom: 160,
    hours: ['07:30-18:00'],
    address: '贵州省安顺市镇宁布依族苗族自治县',
    phone: '0851-35921102',
    images: [img('黄果树瀑布', U.waterfall), img('荔波', U.forest)],
    notice: '含大瀑布、天星桥等景点，景区间需换乘观光车。雨季水量更壮观，路面湿滑。',
    nearby: ['bailong'],
    lat: 25.99, lng: 105.67,
  },
]

export function matchAttractions(q) {
  const kw = (q || '').trim().toLowerCase()
  if (!kw) return []
  return MOCK_ATTRACTIONS.filter(a =>
    a.name.toLowerCase().includes(kw) ||
    a.city.toLowerCase().includes(kw) ||
    a.park.toLowerCase().includes(kw)
  )
}

/** 关键词检索混合结果：poi / landmark / note / topic / ai / tour / deal */
export function buildKeywordHits(q) {
  const kw = (q || '').trim()
  if (!kw) return []
  const spots = matchAttractions(kw)
  const hits = []
  for (const a of spots.slice(0, 3)) {
    hits.push({
      type: 'poi',
      id: a.id,
      title: a.name,
      heat: a.heat,
      address: a.address,
      bookable: a.ticketRequired,
      price: a.ticketRequired ? a.ticketFrom : 0,
    })
    hits.push({ type: 'landmark', id: a.id, title: `${a.name}-上站` })
  }
  const a = spots[0]
  if (a) {
    hits.push({ type: 'note', title: `🎫：我们买的是套票，建议早点到（${a.name}人不多）` })
    hits.push({ type: 'topic', title: `${a.city}${a.name}打卡·话题` })
    if (a.ticketRequired) {
      hits.push({ type: 'tour', id: a.id, title: `${a.park}+${a.name}一日游`, price: Math.max(a.ticketFrom * 3, 199) })
      hits.push({ type: 'deal', id: a.id, title: `【特价推荐】${a.name}门票`, price: a.ticketFrom })
    }
  }
  hits.push({ type: 'ai', title: `问 AI：「${kw}」`, query: kw })
  return hits
}

export function getAttractionById(id) {
  return MOCK_ATTRACTIONS.find(a => a.id === id) || null
}

export function getAttractionByName(name) {
  return MOCK_ATTRACTIONS.find(a => a.name === name) || null
}

export function hydrateNearby(spot) {
  if (!spot) return null
  return {
    ...spot,
    nearbySpots: (spot.nearby || []).map(getAttractionById).filter(Boolean),
  }
}
