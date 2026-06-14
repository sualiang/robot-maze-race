import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const geojsonDir = path.resolve(__dirname, '../geojson_data');

// 缓存到内存（避免每次请求读磁盘）
const geoCache = new Map<string, any>();

function loadGeoJson(filename: string): any {
  if (geoCache.has(filename)) return geoCache.get(filename);
  const filePath = path.join(geojsonDir, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  geoCache.set(filename, raw);
  return raw;
}

// 获取省列表（如 [{adcode: "110000", name: "北京市"}, {adcode: "330000", name: "浙江省"}]）
router.get('/provinces', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(geojsonDir).filter(f => f.endsWith('.geoJson') && f.length === 14); // 6位.geoJson
    const provinces: { adcode: string; name: string }[] = [];

    // 省文件中的 feature 是 city level，需要从文件名推断
    const provinceMap = new Map<string, string>();
    provinceMap.set('110000', '北京市');
    provinceMap.set('120000', '天津市');
    provinceMap.set('130000', '河北省');
    provinceMap.set('140000', '山西省');
    provinceMap.set('150000', '内蒙古自治区');
    provinceMap.set('210000', '辽宁省');
    provinceMap.set('220000', '吉林省');
    provinceMap.set('230000', '黑龙江省');
    provinceMap.set('310000', '上海市');
    provinceMap.set('320000', '江苏省');
    provinceMap.set('330000', '浙江省');
    provinceMap.set('340000', '安徽省');
    provinceMap.set('350000', '福建省');
    provinceMap.set('360000', '江西省');
    provinceMap.set('370000', '山东省');
    provinceMap.set('410000', '河南省');
    provinceMap.set('420000', '湖北省');
    provinceMap.set('430000', '湖南省');
    provinceMap.set('440000', '广东省');
    provinceMap.set('450000', '广西壮族自治区');
    provinceMap.set('460000', '海南省');
    provinceMap.set('500000', '重庆市');
    provinceMap.set('510000', '四川省');
    provinceMap.set('520000', '贵州省');
    provinceMap.set('530000', '云南省');
    provinceMap.set('540000', '西藏自治区');
    provinceMap.set('610000', '陕西省');
    provinceMap.set('620000', '甘肃省');
    provinceMap.set('630000', '青海省');
    provinceMap.set('640000', '宁夏回族自治区');
    provinceMap.set('650000', '新疆维吾尔自治区');
    provinceMap.set('710000', '台湾省');
    provinceMap.set('810000', '香港特别行政区');
    provinceMap.set('820000', '澳门特别行政区');

    for (const f of files) {
      const adcode = f.slice(0, 6);
      const name = provinceMap.get(adcode);
      if (name) {
        provinces.push({ adcode, name });
      }
    }

    // 排序
    provinces.sort((a, b) => a.adcode.localeCompare(b.adcode));
    return res.json({ code: 0, message: 'ok', data: provinces });
  } catch (error: any) {
    console.error('[AdminMaps] /provinces error:', error.message);
    return res.status(500).json({ code: 500, message: '获取省份列表失败', data: null });
  }
});

// 获取省份 GeoJSON（含各地市边界）
router.get('/province/:adcode', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adcode } = req.params;
    const data = loadGeoJson(`${adcode}.geoJson`);
    if (!data) {
      return res.status(404).json({ code: 404, message: '省份 GeoJSON 未找到', data: null });
    }
    return res.json(data);
  } catch (error: any) {
    console.error('[AdminMaps] /province/:adcode error:', error.message);
    return res.status(500).json({ code: 500, message: '获取省份 GeoJSON 失败', data: null });
  }
});

// 获取省份下城市列表
router.get('/province/:adcode/cities', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adcode } = req.params;
    const data = loadGeoJson(`${adcode}.geoJson`);
    if (!data) {
      return res.status(404).json({ code: 404, message: '省份数据未找到', data: null });
    }
    const cities: { adcode: string; name: string }[] = [];
    for (const feat of data.features) {
      const p = feat.properties;
      if (p.level === 'city') {
        cities.push({ adcode: String(p.adcode), name: p.name });
      }
    }
    return res.json({ code: 0, message: 'ok', data: cities });
  } catch (error: any) {
    console.error('[AdminMaps] /province/:adcode/cities error:', error.message);
    return res.status(500).json({ code: 500, message: '获取城市列表失败', data: null });
  }
});

// 获取城市 GeoJSON（含各区县边界），直辖市直接返回
router.get('/city/:adcode', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { adcode } = req.params;

    // 先尝试省文件（直辖市没有单独市文件）
    const provData = loadGeoJson(`${adcode}.geoJson`);
    if (provData) {
      return res.json(provData);
    }

    // 尝试从省份子目录查找
    const provAdcode = adcode.substring(0, 2) + '0000';
    const cityFile = path.join(geojsonDir, provAdcode, `${adcode}.geoJson`);
    if (fs.existsSync(cityFile)) {
      const raw = JSON.parse(fs.readFileSync(cityFile, 'utf-8'));
      geoCache.set(`city_${adcode}`, raw);
      return res.json(raw);
    }

    return res.status(404).json({ code: 404, message: '城市 GeoJSON 未找到', data: null });
  } catch (error: any) {
    console.error('[AdminMaps] /city/:adcode error:', error.message);
    return res.status(500).json({ code: 500, message: '获取城市 GeoJSON 失败', data: null });
  }
});

export default router;
