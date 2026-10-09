/**
 * 景点业务适配层。
 * 真实数据复用现有 /api/map/*，本地精选数据只用于首页推荐和显式 demo 模式。
 */
import { request } from './index'
import {
  MOCK_ATTRACTIONS,
  buildKeywordHits,
  getAttractionById,
  getAttractionByName,
  hydrateNearby,
} from '../data/attractions'

const USE_MOCK = import.meta.env.VITE_USE_MOCK_ATTRACTIONS === 'true'

const unwrap = (res, fallbackMessage) => {
  if (res?.code === 0) return res.data
  throw new Error(res?.message || fallbackMessage)
}

const cleanParams = (params) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
)

const secureImage = (src) => String(src || '').replace(
  /^http:\/\/(store\.is\.autonavi\.com|aos-cdn-image\.amap\.com)/i,
  'https://$1'
)

const poiCategory = (type) => {
  const code = String(type || '')
  if (code.startsWith('1101')) return '公园'
  if (code.startsWith('1102')) return '景区'
  if (code.startsWith('14')) return '文博场馆'
  return '地点'
}

const isTravelPoi = (item) => /^(11|14)/.test(String(item?.type || ''))
  || /(风景名胜|公园|博物馆|旅游景点)/.test(String(item?.tag || ''))

const typeParts = (value) => String(value || '').split(';').filter(Boolean)
const lastTypePart = (value) => {
  const parts = typeParts(value)
  return parts[parts.length - 1] || ''
}

const mapSuggestion = (item) => ({
  type: 'poi',
  id: item.uid,
  uid: item.uid,
  title: item.name,
  address: item.address,
  lat: item.lat,
  lng: item.lng,
  poiType: item.type,
  category: poiCategory(item.type),
})

const parsePrice = (price) => {
  const match = String(price || '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

const mapDetail = (item, target = {}) => {
  if (!item) return null
  const price = parsePrice(item.price)
  const type = item.tag || item.type || ''
  return {
    id: target.uid || target.id || item.uid || `${item.lat},${item.lng}`,
    uid: target.uid || item.uid || '',
    name: item.name,
    city: '',
    park: lastTypePart(type) || '景点',
    heat: null,
    rating: item.rating,
    reviewCount: item.commentCount,
    listTitle: [...new Set(typeParts(type))].join(' · '),
    onRank: false,
    ticketRequired: price > 0,
    ticketFrom: price,
    priceText: item.price || '',
    hours: item.openTime ? [item.openTime] : [],
    address: item.address || '',
    phone: item.telephone || '',
    images: (item.images || []).filter(Boolean).map(src => ({ src: secureImage(src) })),
    overview: item.overview || '',
    notice: item.overview || '开放时间和票务信息可能临时调整，出发前请以景区官方公告为准。',
    nearbySpots: [],
    lat: item.lat,
    lng: item.lng,
  }
}

const mapNearby = (item) => ({
  id: item.uid,
  uid: item.uid,
  name: item.name,
  city: '',
  address: item.address || '',
  rating: item.rating,
  category: lastTypePart(item.tag) || '景点',
  images: item.imageUrl ? [{ src: secureImage(item.imageUrl) }] : [],
  lat: item.lat,
  lng: item.lng,
})

export function getHotSpotNames() {
  return MOCK_ATTRACTIONS.slice(0, 6).map(a => a.name)
}

export async function searchAttractions(q, { city, signal } = {}) {
  const keyword = String(q || '').trim()
  if (!keyword) return []
  if (USE_MOCK) return buildKeywordHits(keyword)

  const data = unwrap(await request('/map/suggestion', {
    params: cleanParams({ keyword, city }),
    signal,
  }), '搜索景点失败') || []
  const travelResults = data.filter(isTravelPoi)
  return (travelResults.length ? travelResults : data).map(mapSuggestion)
}

export async function getAttractionDetail(target, { signal } = {}) {
  const input = typeof target === 'object' && target ? target : { id: target }
  const local = input.id ? getAttractionById(input.id) : null
  if (local) return hydrateNearby(local)
  if (USE_MOCK) return null

  const params = cleanParams({
    uid: input.uid || (!input.lat && !input.lng ? input.id : ''),
    lat: input.lat,
    lng: input.lng,
  })
  if (!params.uid && (params.lat === undefined || params.lng === undefined)) return null
  const data = unwrap(await request('/map/detail', { params, signal }), '加载景点详情失败')
  return mapDetail(data, input)
}

export function findAttractionByName(name) {
  return Promise.resolve(getAttractionByName(name))
}

export function getAttractionHot() {
  return Promise.resolve(MOCK_ATTRACTIONS.slice(0, 8).map(a => ({
    id: a.id,
    name: a.name,
    city: a.city,
  })))
}

export async function getNearbyAttractions(lat, lng, { radius = 5000, signal } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return []
  const data = unwrap(await request('/map/nearby-attractions', {
    params: { lat, lng, radius },
    signal,
  }), '加载周边景点失败') || []
  return data.filter(isTravelPoi).map(mapNearby)
}
