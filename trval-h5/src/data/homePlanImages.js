/**
 * 首页行程封面白名单：只放人工核过的实拍。
 * attraction-images.json 误标很多（动画截图、水印、错地、证件扫描），未列入的一律不用。
 *
 * 本轮搜过但未列入（勿再当合格图加回）：
 * 南普陀寺=蜡笔小新；永定土楼=猫 meme；布达拉宫=植物证书；
 * 凤凰古城=羽毛插画；橘子洲/茶卡/冰雪大世界=百度百科 logo；
 * 恭王府=国标封面；寒山寺=马里奥封面；嘉峪关=红毯明星；
 * 香格里拉=幻想剑；玉龙雪山=世界地标拼贴+摄图网；龙脊梯田=巴黎铁塔；
 * 维多利亚港=维多利亚女王油画；悬空寺=抽象渲染；云冈石窟=瓶盖寄居蟹；
 * 青海湖=行政区地图；纳木错=车窗人像；千户苗寨=海浪特写；
 * 五台山=黑底噪点；德天瀑布=工业 CAD；开平碉楼=平面 logo；
 * 乌镇/平遥/阳朔西街=大字叠加；武隆/北海银滩=社交水印；
 * 喀纳斯/张掖丹霞/趵突泉=摄图网；青城山=隐约图库水印；
 * 莫高窟=带字拼贴；天门山条目实为武陵源峰林；厦门大学条目=夜景双子塔。
 */
export const HOME_PLAN_SAFE = {
  西湖: { image: '/images/landmarks/4b9a47ad501e.jpg', city: '杭州' },
  灵隐寺: { image: '/images/landmarks/577d5fc8441e.jpg', city: '杭州' },
  千岛湖: { image: '/images/landmarks/6952b2a6cb11.jpg', city: '杭州' },
  鼓浪屿: { image: '/images/landmarks/853d068a2306.jpg', city: '厦门' },
  厦门: { image: '/images/landmarks/597f60c6ed8b.jpg', city: '厦门' },
  故宫: { image: '/images/landmarks/3f08d9a555bd.jpg', city: '北京' },
  天安门: { image: '/images/landmarks/eb8cccd7e779.jpg', city: '北京' },
  天安门广场: { image: '/images/landmarks/eb8cccd7e779.jpg', city: '北京' },
  南锣鼓巷: { image: '/images/landmarks/d50f3ec2be32.jpg', city: '北京' },
  圆明园: { image: '/images/landmarks/208f376e9712.jpg', city: '北京' },
  故宫角楼: { image: '/images/landmarks/cd1616d0fe4b.jpg', city: '北京' },
  上海: { image: '/images/landmarks/29fe9eef4322.jpg', city: '上海' },
  陆家嘴: { image: '/images/landmarks/29fe9eef4322.jpg', city: '上海' },
  豫园: { image: '/images/landmarks/21c7087c4b07.jpg', city: '上海' },
  洪崖洞: { image: '/images/landmarks/ee6beeafb829.jpg', city: '重庆' },
  磁器口: { image: '/images/landmarks/ff9dcd0e21d5.jpg', city: '重庆' },
  都江堰: { image: '/images/landmarks/459413fa7eb6.jpg', city: '成都' },
  宽窄巷子: { image: '/images/landmarks/ff0e3e8f81b4.jpg', city: '成都' },
  武侯祠: { image: '/images/landmarks/65d8439100a2.jpg', city: '成都' },
  峨眉山: { image: '/images/landmarks/17b0880ae636.jpg', city: '峨眉山' },
  乐山大佛: { image: '/images/landmarks/9be9c950fed5.jpg', city: '乐山' },
  稻城亚丁: { image: '/images/landmarks/7ee97122a744.jpg', city: '稻城' },
  兵马俑: { image: '/images/landmarks/0d56cb3de9e9.jpg', city: '西安' },
  大雁塔: { image: '/images/landmarks/79b21044d044.jpg', city: '西安' },
  华山: { image: '/images/landmarks/895acb85a9be.jpg', city: '西安' },
  西安城墙: { image: '/images/landmarks/6da5266c7911.jpg', city: '西安' },
  洱海: { image: '/images/landmarks/b866e310b972.jpg', city: '大理' },
  丽江古城: { image: '/images/landmarks/a8e39a29315d.jpg', city: '丽江' },
  蓝月谷: { image: '/images/landmarks/ab1e73d8b2fe.jpg', city: '丽江' },
  泸沽湖: { image: '/images/landmarks/b431bf2e7781.jpg', city: '丽江' },
  天涯海角: { image: '/images/landmarks/4d0f3d299b9c.jpg', city: '三亚' },
  亚龙湾: { image: '/images/landmarks/db2c21239e1f.jpg', city: '三亚' },
  蜈支洲岛: { image: '/images/landmarks/d9c3817593ec.jpg', city: '三亚' },
  黄鹤楼: { image: '/images/landmarks/1cebc1043da9.jpg', city: '武汉' },
  张家界: { image: '/images/landmarks/1260698db1f0.jpg', city: '张家界' },
  武陵源: { image: '/images/landmarks/f1b31232c9b1.jpg', city: '张家界' },
  九寨沟: { image: '/images/landmarks/c06ee7552e4d.jpg', city: '九寨沟' },
  黄果树瀑布: { image: '/images/landmarks/1ca49d9ba37e.jpg', city: '贵州' },
  梵净山: { image: '/images/landmarks/60a052e3fc0a.jpg', city: '贵州' },
  黄山: { image: '/images/landmarks/1986d7d41d8a.jpg', city: '黄山' },
  宏村: { image: '/images/landmarks/7ec7066f42b3.jpg', city: '黄山' },
  漓江: { image: '/images/landmarks/ac3fee83cf73.jpg', city: '桂林' },
  三坊七巷: { image: '/images/landmarks/28ff658bd8fa.jpg', city: '福州' },
  武夷山: { image: '/images/landmarks/717327fd7235.jpg', city: '武夷山' },
  平潭岛: { image: '/images/landmarks/67cbcb3c116f.jpg', city: '平潭' },
  西塘: { image: '/images/landmarks/f8fc9b24efc1.jpg', city: '嘉兴' },
  拙政园: { image: '/images/landmarks/db3cab7c63a8.jpg', city: '苏州' },
  虎丘: { image: '/images/landmarks/03b92ed40459.jpg', city: '苏州' },
  周庄: { image: '/images/landmarks/2607b392b4f9.jpg', city: '苏州' },
  中山陵: { image: '/images/landmarks/e318ae576c73.jpg', city: '南京' },
  夫子庙: { image: '/images/landmarks/8425f17177c9.jpg', city: '南京' },
  瘦西湖: { image: '/images/landmarks/32e459365a85.jpg', city: '扬州' },
  泰山: { image: '/images/landmarks/ba9c1bc0df23.jpg', city: '泰安' },
  少林寺: { image: '/images/landmarks/573a071647d9.jpg', city: '郑州' },
  龙门石窟: { image: '/images/landmarks/ac29cf8b1eae.jpg', city: '洛阳' },
  婺源: { image: '/images/landmarks/203651e23594.jpg', city: '婺源' },
  赛里木湖: { image: '/images/landmarks/d540ec1ec3bf.jpg', city: '新疆' },
  羊卓雍措: { image: '/images/landmarks/c2363c8932fb.jpg', city: '拉萨' },
  鸣沙山月牙泉: { image: '/images/landmarks/bd07dad77736.jpg', city: '敦煌' },
  鸣沙山: { image: '/images/landmarks/bd07dad77736.jpg', city: '敦煌' },
  月牙泉: { image: '/images/landmarks/bd07dad77736.jpg', city: '敦煌' },
  长白山天池: { image: '/images/landmarks/d26a7fb9d8f2.jpg', city: '长白山' },
  长白山: { image: '/images/landmarks/d26a7fb9d8f2.jpg', city: '长白山' },
  圣索菲亚教堂: { image: '/images/landmarks/ffd27938b753.jpg', city: '哈尔滨' },
  大三巴牌坊: { image: '/images/landmarks/117ddd229d49.jpg', city: '澳门' },
  大三巴: { image: '/images/landmarks/117ddd229d49.jpg', city: '澳门' },
  石林: { image: '/images/landmarks/e5e7f458e761.jpg', city: '昆明' },
  滕王阁: { image: '/images/landmarks/4da3dd4675ec.jpg', city: '南昌' },
  白云山: { image: '/images/landmarks/6e104cc2b602.jpg', city: '广州' },
  壶口瀑布: { image: '/images/landmarks/db9a5f74943d.jpg', city: '延安' },
}
