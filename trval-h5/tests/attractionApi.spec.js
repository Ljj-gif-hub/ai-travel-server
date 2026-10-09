import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../src/api/index', () => ({ request }))

import {
  getAttractionDetail,
  getNearbyAttractions,
  searchAttractions,
} from '../src/api/attraction'

describe('景点真实地图接口适配', () => {
  beforeEach(() => request.mockReset())

  it('搜索优先保留景区并携带详情所需 uid 和坐标', async () => {
    request.mockResolvedValue({
      code: 0,
      data: [
        { name: '杭州西湖风景名胜区', uid: 'west-lake-uid', lat: 30.2, lng: 120.1, type: '110202', address: '龙井路1号' },
        { name: 'Apple 西湖', uid: 'shop-uid', type: '060306', address: '平海路' },
      ],
    })

    const result = await searchAttractions('西湖')

    expect(request).toHaveBeenCalledWith('/map/suggestion', expect.objectContaining({
      params: { keyword: '西湖' },
    }))
    expect(result).toEqual([expect.objectContaining({
      uid: 'west-lake-uid', title: '杭州西湖风景名胜区', category: '景区', lat: 30.2, lng: 120.1,
    })])
  })

  it('详情把后端字段映射为页面模型并升级高德图片为 HTTPS', async () => {
    request.mockResolvedValue({
      code: 0,
      data: {
        name: '杭州西湖风景名胜区', address: '龙井路1号', telephone: '0571-12345678',
        lat: 30.2, lng: 120.1, type: '风景名胜;国家级景点', price: '80元',
        openTime: '08:00-18:00', images: ['http://store.is.autonavi.com/showpic/demo'], rating: 4.9,
      },
    })

    const result = await getAttractionDetail({ uid: 'west-lake-uid' })

    expect(result).toEqual(expect.objectContaining({
      uid: 'west-lake-uid', ticketRequired: true, ticketFrom: 80, hours: ['08:00-18:00'],
    }))
    expect(result.images[0].src).toBe('https://store.is.autonavi.com/showpic/demo')
  })

  it('周边景点按旅游类型筛选', async () => {
    request.mockResolvedValue({
      code: 0,
      data: [
        { name: '断桥残雪', uid: 'bridge', tag: '风景名胜;旅游景点', imageUrl: '', rating: 4.8 },
        { name: '便利店', uid: 'shop', tag: '购物服务;便利店', imageUrl: '' },
      ],
    })

    const result = await getNearbyAttractions(30.2, 120.1)
    expect(result.map(item => item.uid)).toEqual(['bridge'])
  })
})
