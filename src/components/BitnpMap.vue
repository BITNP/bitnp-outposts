<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

const MODEL_URL = '/model/LiangxiangMap.glb'

// ---- 可调参数 ----------------------------------------------------------
// 楼块颜色（纯白）
const BUILDING_COLOR = 0xffffff
// 水体表面：深蓝、粗糙（粗糙度越高越不产生刺眼高光）
const WATER_SURFACE_COLOR = 0x0300af
const WATER_EMISSIVE = 0x0a2f5c
const WATER_EMISSIVE_INTENSITY = 0.25
const WATER_ROUGHNESS = 0.3
// 水体轮廓光：深蓝幽光（"发光"来自围绕水体的光环，而不是水面本身）
const HALO_COLOR = 0x1b34ff
const HALO_INTENSITY = 2.0
const HALO_FALLOFF = 10.0 // 越大，光晕边缘衰减越快
const HALO_WIDTH_RATIO = 0.005 // 光环宽度 = 模型水平尺寸 * 该比例
const CONTOUR_COLOR = 0x96ecff
const CONTOUR_OPACITY = 0.85

// —— 初始坐标常量 ——
// 模型初始中心位置（相对原点 / 网格中心）。相机初始位置不再由它决定。
const INITIAL_COORD = { x: -400, y: 0, z: -300 }

// —— 相机与缩放 ——
// 相机到原点的初始距离（决定初始缩放）
const CAMERA_START_DISTANCE = 800
// 缩放范围：距离越小 = 放大（缩放比例大），距离越大 = 缩小（缩放比例小）
const CAMERA_MIN_DISTANCE = 600
const CAMERA_MAX_DISTANCE = 1800
// 高度角与缩放耦合：缩小(距离最大)时 80°（近似俯视），放大(距离最小)时线性降到 30°
const CAMERA_MAX_ELEVATION_DEG = 80
const CAMERA_MIN_ELEVATION_DEG = 30
// 相机注视点（也是网格径向渐变的中心）：相机始终看向它
const CAMERA_TARGET = new THREE.Vector3(0, 0, 0)
// —— 相机水平角（独立控制）——
// 镜头在水平面内朝向的罗盘方向：0 = 北, 90 = 东, 180 = 南, 270 = 西。
// 初始 0 即"上北下南"（模型约定：东 = +X，北 = -Z，来自 Blender/OSM 导出惯例；
// 若你模型的朝向不同，只改这一个值即可）。
const CAMERA_BEARING_DEG = -20

// —— 交互灵敏度 ——
const ORBIT_SPEED = 0.006 // 旋转：弧度/像素
const ZOOM_SPEED = 0.0015 // 滚轮缩放：距离按 e^(deltaY * 该值) 变化
// 模型底面相对网格平面(原点 y=0)的抬高量，避免与网格线共面闪烁
const MODEL_GROUND_LIFT = 1.0

// —— 地面网格（固定在原点）——
const GRID_COLOR = 0xffffff
const GRID_OPACITY = 0.16
// 网格边长 = 模型水平方向的较长边 × GRID_SPAN_RATIO
const GRID_SPAN_RATIO = 1.0
// 若 > 0，则直接使用这个绝对尺寸（单位与模型一致），忽略 GRID_SPAN_RATIO
const GRID_SPAN = 4000
// 网格被划分成多少格（越大格子越密、线越细）
const GRID_DIVISIONS = 60
// —— 网格径向淡出（从网格中心向外，超过开始半径后逐渐变淡，到结束半径完全消失）——
// 用网格半边长(span / 2)的比例表示：0 = 中心，1 = 网格边缘
const GRID_FADE_START_RATIO = 0.2
// "结束半径"随缩放变化（相对网格半边长）：
// 缩到最小时（相机最远）= MIN，放到最大时（相机最近）= MAX，中间线性
const GRID_FADE_END_RATIO_MIN = 0.25
const GRID_FADE_END_RATIO_MAX = 0.70
// 淡出曲线指数：1 = 线性，越大越"晚"才开始明显变淡
const GRID_FADE_CURVE = 1.5

// —— 信标（黄色科幻光柱 + 黄色文字标注）——
// 颜色 / 尺寸
const BEACON_COLOR = 0xffd24a
const BEACON_HEIGHT = 220
const BEACON_RADIUS = 8
const BEACON_CORE_RADIUS = 5
const BEACON_OPACITY = 0.4
const BEACON_CORE_OPACITY = 0.8
const BEACON_INTENSITY = 1.7 // HDR 亮度倍数（初始亮度，>1 才会触发 Bloom 发光）
// 悬停高亮（鼠标射线最接近的光柱）：更亮、更高、波纹更快、文字更大
const BEACON_HOVER_RADIUS_RATIO = 0.05 // 判定半径 = 相机距离 * 该比例（约等于屏幕上的像素半径）
const BEACON_HOVER_BRIGHTNESS = 1.9 // 亮度倍数
const BEACON_HOVER_HEIGHT = 1.6 // 高度倍数
const BEACON_HOVER_RIPPLE_SPEED = 2.2 // 波纹速度倍数
const BEACON_HOVER_LABEL_SCALE = 1.35 // 文字大小倍数
const BEACON_HOVER_EASE = 8 // 过渡速度（越大越快）
// 上升粒子
const BEACON_PARTICLE_COUNT = 60 // 每根光柱的粒子数
const BEACON_PARTICLE_SIZE = 7 // 粒子直径（世界单位，按透视缩放）
const BEACON_PARTICLE_OPACITY = 0.9
const BEACON_PARTICLE_SPEED_MIN = 40 // 上升速度（世界单位/秒）最小值
const BEACON_PARTICLE_SPEED_MAX = 110 // 最大值（速度随机）
const BEACON_PARTICLE_HEIGHT_MIN = 0.45 // 上升距离（相对光柱高度）最小值
const BEACON_PARTICLE_HEIGHT_MAX = 1.0 // 最大值（上升距离随机）
const BEACON_PARTICLE_RADIUS = 6 // 粒子出现的水平半径范围
// 底部圆形波纹
const BEACON_RIPPLE_COUNT = 3
const BEACON_RIPPLE_RADIUS = 120 // 波纹最大半径
const BEACON_RIPPLE_SPEED = 0.2 // 每秒扩散圈数
const BEACON_RIPPLE_THICKNESS = 0.06 // 环宽（0~1）
const BEACON_RIPPLE_OPACITY = 0.9
const BEACON_RIPPLE_LIFT = 1.0 // 相对模型底面的抬高，避免与地面共面闪烁
// 文字标注
const BEACON_LABEL_COLOR = '#ffd24a'
const BEACON_LABEL_HEIGHT = 45 // 文字在世界里的高度
const BEACON_LABEL_Y = 150 // 文字中心相对信标底部的高度
// 文字"左边缘"相对光柱中心的水平距离。缩放时这个间隙保持不变，
// 而文字宽度会随缩放变小，所以文字会自动更靠近光柱。
const BEACON_LABEL_OFFSET_X = 20
// 文字随缩放的补偿强度：1 = 屏幕尺寸基本不变，0 = 不补偿（正常透视缩放）
const BEACON_LABEL_ZOOM_COMPENSATION = 1
// 文字尺寸的参考距离：固定常量，与 CAMERA_START_DISTANCE 无关。
// 它只定义"标准大小"对应的距离（此时文字世界高度 = BEACON_LABEL_HEIGHT）；
// 因此调整 CAMERA_START_DISTANCE 时，同一 distance 下的文字大小保持不变。
const BEACON_LABEL_REFERENCE_DISTANCE = 1800
// 信标位置：x / z 是相对"模型中心"的水平偏移（模型局部坐标；+X 东，+Z 南）
const BEACONS = [
  { label: '网协办公室', x: 300, z: 325 },
  { label: '图书馆电脑诊所', x: 480, z: 280 },
  { label: '求是社区电脑诊所', x: 200, z: 460 },
]

// 辉光（Bloom）：强度 / 半径 / 阈值（阈值越高，只有越亮的东西发光）
const BLOOM_STRENGTH = 0.7
const BLOOM_RADIUS = 0.5
const BLOOM_THRESHOLD = 0.85
// -----------------------------------------------------------------------

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
// 标注文字单独一个场景，在后期(Bloom)之后绘制，保证不受光照/辉光影响、始终清晰
let labelScene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let composer: EffectComposer | null = null
let resizeObserver: ResizeObserver | null = null
let animationId = 0
let canvasEl: HTMLCanvasElement | null = null

// 模型（拖拽时移动它）
let model: THREE.Object3D | null = null
// 地面网格（跟随模型移动）
let grid: THREE.LineSegments | null = null
let gridHalfSpan = 0
// 信标动画（共享材质 + 时钟）
let beaconParticleMaterial: THREE.ShaderMaterial | null = null
const beaconClock = new THREE.Clock()
// 信标运行时状态（用于悬停高亮、随缩放调整文字等）
interface BeaconRuntime {
  root: THREE.Group
  pillar: THREE.Mesh
  core: THREE.Mesh
  pillarMaterial: THREE.ShaderMaterial
  coreMaterial: THREE.ShaderMaterial
  rippleMaterial: THREE.ShaderMaterial
  label: THREE.Sprite | null
  hover: number // 0 = 常态, 1 = 完全悬停（带缓动）
  ripplePhase: number // 累加的波纹相位（避免改变速度时相位跳变）
}
const beacons: BeaconRuntime[] = []
// 鼠标悬停用的射线与指针位置（NDC）
const pointerNdc = new THREE.Vector2(-2, -2)
const raycaster = new THREE.Raycaster()
const _beaconBase = new THREE.Vector3()
const _beaconSample = new THREE.Vector3()
let beaconElapsed = 0

// 相机轨道状态：相机始终看向原点，位置由 水平角(罗盘朝向) + 高度角 + 距离 决定
let bearing = THREE.MathUtils.degToRad(CAMERA_BEARING_DEG)
let distance = CAMERA_START_DISTANCE
let elevation = THREE.MathUtils.degToRad(CAMERA_MAX_ELEVATION_DEG)

// 指针交互状态
let pointerMode: 'none' | 'rotate' | 'pan' = 'none'
let lastX = 0
let lastY = 0
const activePointers = new Map<number, { x: number; y: number }>()
let pinchDistance = 0
let pinchMidX = 0
let pinchMidY = 0

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const _forwardGround = new THREE.Vector3()
const _right = new THREE.Vector3()

/** 缩放(距离) -> 高度角：距离最大(缩小)时 80°，距离最小(放大)时 30°，中间线性 */
function elevationForDistance(value: number) {
  const t = THREE.MathUtils.clamp(
    (value - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE),
    0,
    1,
  )
  const deg = THREE.MathUtils.lerp(CAMERA_MIN_ELEVATION_DEG, CAMERA_MAX_ELEVATION_DEG, t)
  return THREE.MathUtils.degToRad(deg)
}

/** 缩放(距离) -> 网格渐变"结束半径"比例：缩到最小(相机最远)=MIN，放到最大(相机最近)=MAX，中间线性 */
function fadeEndRatioForDistance(value: number) {
  const t = THREE.MathUtils.clamp(
    (value - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE),
    0,
    1,
  )
  return THREE.MathUtils.lerp(GRID_FADE_END_RATIO_MAX, GRID_FADE_END_RATIO_MIN, t)
}

/** 把当前缩放对应的网格渐变范围写进着色器 */
function updateGridFadeRange() {
  if (!grid) return
  const material = grid.material as THREE.ShaderMaterial
  const fadeStart = gridHalfSpan * GRID_FADE_START_RATIO
  const fadeEnd = Math.max(gridHalfSpan * fadeEndRatioForDistance(distance), fadeStart + 1e-4)
  material.uniforms.uFadeStart.value = fadeStart
  material.uniforms.uFadeEnd.value = fadeEnd
}

/** 根据当前轨道状态更新相机位置，并让相机始终朝向原点 */
function updateCamera() {
  if (!camera) return
  elevation = elevationForDistance(distance)

  // 镜头朝向的罗盘方向 -> 世界方向：东 = +X，北 = -Z
  const lookX = Math.sin(bearing)
  const lookZ = -Math.cos(bearing)
  const horizontal = distance * Math.cos(elevation)
  camera.position.set(
    -horizontal * lookX,
    distance * Math.sin(elevation),
    -horizontal * lookZ,
  )
  camera.up.copy(WORLD_UP)
  camera.lookAt(CAMERA_TARGET)
  camera.updateMatrixWorld()
  updateGridFadeRange()
}

/** 缩放：改变相机到原点的距离，并同步耦合高度角 */
function zoomBy(factor: number) {
  distance = THREE.MathUtils.clamp(
    distance * factor,
    CAMERA_MIN_DISTANCE,
    CAMERA_MAX_DISTANCE,
  )
  updateCamera()
}

/** 拖拽：不移动相机，而是把模型沿相机的地面朝向平移（不改变高度角） */
function panModelByPixels(dx: number, dy: number) {
  if (!model || !camera) return

  const viewportHeight = containerRef.value?.clientHeight || 1
  const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const unitsPerPixel = visibleHeight / viewportHeight

  // 相机"朝向原点"的方向在地面上的投影，以及它的右手方向
  _forwardGround.set(-camera.position.x, 0, -camera.position.z)
  if (_forwardGround.lengthSq() < 1e-8) _forwardGround.set(0, 0, -1)
  _forwardGround.normalize()
  _right.crossVectors(_forwardGround, WORLD_UP).normalize()

  // 地面上的前后移动在屏幕上会被高度角压缩，这里做一次补偿
  const sinElevation = Math.max(Math.sin(elevation), 0.2)
  const forwardAmount = (dy * unitsPerPixel) / sinElevation
  const rightAmount = dx * unitsPerPixel

  model.position.x += _right.x * rightAmount - _forwardGround.x * forwardAmount
  model.position.z += _right.z * rightAmount - _forwardGround.z * forwardAmount
}

function materialNames(mesh: THREE.Mesh): string[] {
  const material = mesh.material
  const list = Array.isArray(material) ? material : [material]
  return list.filter(Boolean).map((item) => item.name ?? '')
}

/**
 * 遍历模型，按材质名把楼块刷白、把水体改成不刺眼的深蓝水面。
 * 该 glb 的材质命名：wall / roof 为楼块，water 为水体。
 */
function styleMaterials(root: THREE.Object3D) {
  const processed = new Set<THREE.Material>()

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material || processed.has(material)) continue
      processed.add(material)

      const standard = material as THREE.MeshStandardMaterial
      const name = material.name

      if (name === 'wall' || name === 'roof') {
        // 楼块：纯白
        standard.color?.set(BUILDING_COLOR)
        standard.emissive?.set(0x000000)
        standard.roughness = 0.9
        if ('metalness' in standard) standard.metalness = 0.0
      } else if (name === 'water') {
        // 水面：深蓝、粗糙，仅保留极弱的自发光，避免出现刺眼高光
        standard.color?.set(WATER_SURFACE_COLOR)
        standard.emissive = new THREE.Color(WATER_EMISSIVE)
        standard.emissiveIntensity = WATER_EMISSIVE_INTENSITY
        standard.roughness = WATER_ROUGHNESS
        if ('metalness' in standard) standard.metalness = 0.0
      }
    }
  })
}

/**
 * 提取水体几何体的边界边，并在轮廓外侧生成一圈深蓝色光晕（带宽度的渐变光带）。
 * 光晕几何体使用水体自身的局部坐标，因此作为水体的子节点即可自动对齐。
 */
function buildWaterGlow(
  geometry: THREE.BufferGeometry,
  width: number,
  yLift: number,
): THREE.Group | null {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!position) return null

  const index = geometry.getIndex()
  const vertexCount = position.count
  const triCount = Math.floor((index ? index.count : vertexCount) / 3)
  if (triCount === 0) return null

  const idxAt = (i: number) => (index ? index.getX(i) : i)

  // 按顶点坐标"焊接"重复顶点，这样无论几何体是否 indexed 都能正确找出边界边
  const weldId = new Int32Array(vertexCount)
  const idByPosition = new Map<string, number>()
  let nextId = 0
  for (let i = 0; i < vertexCount; i++) {
    const key = `${position.getX(i)}|${position.getY(i)}|${position.getZ(i)}`
    let id = idByPosition.get(key)
    if (id === undefined) {
      id = nextId++
      idByPosition.set(key, id)
    }
    weldId[i] = id
  }

  const edgeKey = (a: number, b: number) =>
    a < b ? `${weldId[a]}_${weldId[b]}` : `${weldId[b]}_${weldId[a]}`

  // 第一遍：统计每条边被多少个三角形使用，只被用一次的即为边界边
  const counts = new Map<string, number>()
  for (let t = 0; t < triCount; t++) {
    const i0 = idxAt(t * 3)
    const i1 = idxAt(t * 3 + 1)
    const i2 = idxAt(t * 3 + 2)
    const edges: Array<[number, number]> = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ]
    for (const [a, b] of edges) {
      const key = edgeKey(a, b)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const bandPositions: number[] = []
  const bandT: number[] = []
  const contourPositions: number[] = []

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const outward = new THREE.Vector3()
  const outerA = new THREE.Vector3()
  const outerB = new THREE.Vector3()

  // 第二遍：对每条边界边，在其外侧（沿面法线判断，兼容任意环绕方向）铺一条渐变光带
  for (let t = 0; t < triCount; t++) {
    const i0 = idxAt(t * 3)
    const i1 = idxAt(t * 3 + 1)
    const i2 = idxAt(t * 3 + 2)

    a.fromBufferAttribute(position, i0)
    b.fromBufferAttribute(position, i1)
    c.fromBufferAttribute(position, i2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    normal.crossVectors(ab, ac)
    if (normal.lengthSq() < 1e-12) continue
    normal.normalize()

    const edges: Array<[number, number]> = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ]

    for (const [ea, eb] of edges) {
      if ((counts.get(edgeKey(ea, eb)) ?? 0) !== 1) continue

      a.fromBufferAttribute(position, ea)
      b.fromBufferAttribute(position, eb)
      dir.subVectors(b, a)

      // 外侧方向 = 边方向 × 面法线，投影到水平面
      outward.crossVectors(dir, normal)
      outward.y = 0
      if (outward.lengthSq() < 1e-12) continue
      outward.normalize()

      const aY = a.y + yLift
      const bY = b.y + yLift
      outerA.copy(a).addScaledVector(outward, width)
      outerB.copy(b).addScaledVector(outward, width)
      outerA.y = aY
      outerB.y = bY

      // 光带：内圈（aT=0，亮）-> 外圈（aT=1，淡）
      bandPositions.push(
        a.x, aY, a.z,
        b.x, bY, b.z,
        outerB.x, outerB.y, outerB.z,
        a.x, aY, a.z,
        outerB.x, outerB.y, outerB.z,
        outerA.x, outerA.y, outerA.z,
      )
      bandT.push(0, 0, 1, 0, 1, 1)

      // 贴边的细轮廓线
      contourPositions.push(a.x, aY, a.z, b.x, bY, b.z)
    }
  }

  if (bandPositions.length === 0) return null

  const group = new THREE.Group()
  group.name = 'water-glow'

  const bandGeometry = new THREE.BufferGeometry()
  bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3))
  bandGeometry.setAttribute('aT', new THREE.Float32BufferAttribute(bandT, 1))

  const bandMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(HALO_COLOR) },
      uIntensity: { value: HALO_INTENSITY },
      uFalloff: { value: HALO_FALLOFF },
    },
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uFalloff;
      varying float vT;
      void main() {
        float alpha = pow(clamp(1.0 - vT, 0.0, 1.0), uFalloff) * uIntensity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const band = new THREE.Mesh(bandGeometry, bandMaterial)
  band.name = 'water-halo-band'
  band.renderOrder = 2
  group.add(band)

  const contourGeometry = new THREE.BufferGeometry()
  contourGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(contourPositions, 3),
  )
  const contourMaterial = new THREE.LineBasicMaterial({
    color: CONTOUR_COLOR,
    transparent: true,
    opacity: CONTOUR_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const contour = new THREE.LineSegments(contourGeometry, contourMaterial)
  contour.name = 'water-halo-contour'
  contour.renderOrder = 3
  group.add(contour)

  return group
}

function addWaterGlow(root: THREE.Object3D, modelSize: THREE.Vector3) {
  const width = (Math.max(modelSize.x, modelSize.z) || 1) * HALO_WIDTH_RATIO
  const yLift = Math.max(modelSize.y, 1) * 0.01

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!materialNames(mesh).includes('water')) return

    const glow = buildWaterGlow(mesh.geometry, width, yLift)
    if (glow) mesh.add(glow)
  })
}

/** 光柱材质：沿高度向上渐隐，颜色乘 uIntensity 进入 HDR 以获得 Bloom 辉光 */
function createBeaconPillarMaterial(opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(BEACON_COLOR) },
      uHeight: { value: BEACON_HEIGHT },
      uOpacity: { value: opacity },
      uIntensity: { value: BEACON_INTENSITY },
    },
    vertexShader: /* glsl */ `
      uniform float uHeight;
      varying float vH;
      void main() {
        vH = (position.y + uHeight * 0.5) / uHeight; // 0 = 底部, 1 = 顶部
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uIntensity;
      varying float vH;
      void main() {
        float fade = pow(1.0 - clamp(vH, 0.0, 1.0), 1.6);
        gl_FragColor = vec4(uColor * uIntensity, fade * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** 用 canvas 画黄色文字，做成始终朝向相机的 Sprite 标注 */
function createBeaconLabel(text: string) {
  const fontSize = 72
  const padding = 28
  const font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`

  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) return null
  measureCtx.font = font
  const textWidth = Math.ceil(measureCtx.measureText(text).width)

  const canvas = document.createElement('canvas')
  canvas.width = textWidth + padding * 2
  canvas.height = fontSize + padding * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.shadowColor = BEACON_LABEL_COLOR
  ctx.shadowBlur = 18
  ctx.fillStyle = BEACON_LABEL_COLOR
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false, // 文字单独在后期之后绘制，始终在最上层
    toneMapped: false, // 不受色调映射影响，颜色保持原样
  })

  const sprite = new THREE.Sprite(material)
  const aspect = canvas.width / canvas.height
  const baseWidth = BEACON_LABEL_HEIGHT * aspect
  const baseHeight = BEACON_LABEL_HEIGHT
  sprite.userData.baseWidth = baseWidth
  sprite.userData.baseHeight = baseHeight
  sprite.scale.set(baseWidth, baseHeight, 1)
  return sprite
}

/** 上升粒子材质（所有信标共用，逐粒子随机由几何属性提供） */
function createBeaconParticleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uViewportHeight: { value: 1 },
      uColor: { value: new THREE.Color(BEACON_COLOR) },
      uIntensity: { value: BEACON_INTENSITY },
      uOpacity: { value: BEACON_PARTICLE_OPACITY },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uViewportHeight;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aTravel;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        // 以随机相位在 0~1 之间循环，progress 越大升得越高
        float progress = fract(aPhase + uTime * aSpeed / max(aTravel, 1e-3));
        vec3 p = vec3(position.x, progress * aTravel, position.z);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        // 透视缩放：世界尺寸 -> 屏幕像素
        gl_PointSize = aSize * projectionMatrix[1][1] * uViewportHeight * 0.5 / max(-mvPosition.z, 1.0);
        vAlpha = pow(1.0 - progress, 1.5); // 越往上越暗，最终消失
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * uOpacity;
        if (a <= 0.001) discard;
        gl_FragColor = vec4(uColor * uIntensity, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

/** 一束上升粒子：位置存于 position.xz，y 由着色器随进度上升 */
function createBeaconParticles() {
  const count = BEACON_PARTICLE_COUNT
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const speeds = new Float32Array(count)
  const travels = new Float32Array(count)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * BEACON_PARTICLE_RADIUS
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = Math.sin(angle) * radius
    phases[i] = Math.random()
    speeds[i] = THREE.MathUtils.lerp(
      BEACON_PARTICLE_SPEED_MIN,
      BEACON_PARTICLE_SPEED_MAX,
      Math.random(),
    )
    travels[i] =
      BEACON_HEIGHT *
      THREE.MathUtils.lerp(BEACON_PARTICLE_HEIGHT_MIN, BEACON_PARTICLE_HEIGHT_MAX, Math.random())
    sizes[i] = BEACON_PARTICLE_SIZE * (0.6 + Math.random() * 0.8)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  geometry.setAttribute('aTravel', new THREE.BufferAttribute(travels, 1))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

  if (!beaconParticleMaterial) beaconParticleMaterial = createBeaconParticleMaterial()
  const points = new THREE.Points(geometry, beaconParticleMaterial)
  points.frustumCulled = false // 粒子会升到几何包围盒之外
  return points
}

/** 底部波纹材质（所有信标共用；环数通过宏注入，因为 GLSL 循环需要常量上界） */
function createBeaconRippleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      // 累加相位：每帧 += 速度 * dt，速度变化时相位连续，不会跳变
      uPhase: { value: 0 },
      uColor: { value: new THREE.Color(BEACON_COLOR) },
      uIntensity: { value: BEACON_INTENSITY },
      uOpacity: { value: BEACON_RIPPLE_OPACITY },
      uThickness: { value: BEACON_RIPPLE_THICKNESS },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define RING_COUNT ${BEACON_RIPPLE_COUNT}
      uniform float uPhase;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uThickness;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0; // 0 = 中心, 1 = 边缘
        if (r > 1.0) discard;
        float ripple = 0.0;
        for (int i = 0; i < RING_COUNT; i++) {
          float phase = fract(uPhase + float(i) / float(RING_COUNT));
          float ringR = phase; // 环半径由 0 向外扩散到 1
          float ring = 1.0 - smoothstep(0.0, uThickness, abs(r - ringR));
          ripple += ring * (1.0 - phase); // 越往外越淡
        }
        float alpha = clamp(ripple, 0.0, 1.0) * uOpacity;
        alpha *= 1.0 - smoothstep(0.85, 1.0, r); // 外缘柔化
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(uColor * uIntensity, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** 生成一根信标（底部在 group 原点）：光柱 + 内芯 + 上升粒子 + 底部波纹 + 文字标注 */
function createBeacon(label: string): BeaconRuntime {
  const root = new THREE.Group()

  const pillarMaterial = createBeaconPillarMaterial(BEACON_OPACITY)
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(BEACON_RADIUS, BEACON_RADIUS, BEACON_HEIGHT, 24, 1, true),
    pillarMaterial,
  )
  pillar.position.y = BEACON_HEIGHT / 2
  root.add(pillar)

  const coreMaterial = createBeaconPillarMaterial(BEACON_CORE_OPACITY)
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(BEACON_CORE_RADIUS, BEACON_CORE_RADIUS, BEACON_HEIGHT, 16, 1, true),
    coreMaterial,
  )
  core.position.y = BEACON_HEIGHT / 2
  root.add(core)

  root.add(createBeaconParticles())

  const rippleMaterial = createBeaconRippleMaterial()
  const ripple = new THREE.Mesh(
    new THREE.CircleGeometry(BEACON_RIPPLE_RADIUS, 48),
    rippleMaterial,
  )
  ripple.rotation.x = -Math.PI / 2
  ripple.position.y = BEACON_RIPPLE_LIFT
  root.add(ripple)

  const sprite = createBeaconLabel(label)
  if (sprite) {
    // 文字放到独立场景（世界坐标，每帧跟随信标），不随光柱受光照/Bloom 影响
    labelScene?.add(sprite)
  }

  const record: BeaconRuntime = {
    root,
    pillar,
    core,
    pillarMaterial,
    coreMaterial,
    rippleMaterial,
    label: sprite,
    hover: 0,
    ripplePhase: 0,
  }
  beacons.push(record)
  return record
}

/** 每帧更新信标：按鼠标射线挑选最近的光柱作为悬停目标，并缓动应用高亮效果 */
function updateBeaconStates(delta: number) {
  let hovered: BeaconRuntime | null = null
  let bestDistance = Infinity

  if (camera) {
    raycaster.setFromCamera(pointerNdc, camera)
    const threshold = distance * BEACON_HOVER_RADIUS_RATIO
    for (const record of beacons) {
      record.root.getWorldPosition(_beaconBase)
      // 沿光柱轴线取几个采样点，取到射线的最近距离
      for (let i = 0; i <= 3; i++) {
        _beaconSample.set(_beaconBase.x, _beaconBase.y + (BEACON_HEIGHT * i) / 3, _beaconBase.z)
        const d = raycaster.ray.distanceToPoint(_beaconSample)
        if (d < bestDistance) {
          bestDistance = d
          hovered = record
        }
      }
    }
    if (bestDistance > threshold) hovered = null
  }

  const ease = 1 - Math.exp(-BEACON_HOVER_EASE * delta)
  for (const record of beacons) {
    const target = record === hovered ? 1 : 0
    record.hover += (target - record.hover) * ease
    const h = record.hover

    // 亮度
    const brightness = BEACON_INTENSITY * (1 + h * (BEACON_HOVER_BRIGHTNESS - 1))
    record.pillarMaterial.uniforms.uIntensity.value = brightness
    record.coreMaterial.uniforms.uIntensity.value = brightness

    // 高度（只缩放竖直方向，着色器的渐变不受影响）
    const heightScale = 1 + h * (BEACON_HOVER_HEIGHT - 1)
    record.pillar.scale.y = heightScale
    record.core.scale.y = heightScale
    record.pillar.position.y = (BEACON_HEIGHT * heightScale) / 2
    record.core.position.y = (BEACON_HEIGHT * heightScale) / 2

    // 波纹：速度乘在高亮系数上；相位用积分累加，速度变化时相位连续、不会跳变
    const rippleSpeed = BEACON_RIPPLE_SPEED * (1 + h * (BEACON_HOVER_RIPPLE_SPEED - 1))
    record.ripplePhase += rippleSpeed * delta
    record.rippleMaterial.uniforms.uPhase.value = record.ripplePhase

    // 文字：缩放补偿 + 悬停放大，并按左边缘对齐
    const label = record.label
    if (label) {
      record.root.getWorldPosition(_beaconBase)
      // 只依赖当前 distance（参考距离是固定常量），与 CAMERA_START_DISTANCE 无关
      const ratio = distance / BEACON_LABEL_REFERENCE_DISTANCE
      const zoomFactor = Math.pow(ratio, BEACON_LABEL_ZOOM_COMPENSATION)
      const factor = zoomFactor * (1 + h * (BEACON_HOVER_LABEL_SCALE - 1))
      const baseWidth = (label.userData.baseWidth as number) ?? 1
      const baseHeight = (label.userData.baseHeight as number) ?? 1
      const width = baseWidth * factor
      label.scale.set(width, baseHeight * factor, 1)
      // 世界坐标定位（模型根只有平移，所以世界偏移 = 本地偏移）
      label.position.set(
        _beaconBase.x + BEACON_LABEL_OFFSET_X + width / 2,
        _beaconBase.y + BEACON_LABEL_Y,
        _beaconBase.z,
      )
    }
  }
}

/** 把所有信标挂到模型上（随模型一起移动），位置相对模型中心、底部贴模型底面 */
function addBeacons(root: THREE.Object3D, modelCenter: THREE.Vector3, modelBaseY: number) {
  const group = new THREE.Group()
  group.name = 'beacons'

  for (const beacon of BEACONS) {
    const record = createBeacon(beacon.label)
    record.root.position.set(modelCenter.x + beacon.x, modelBaseY, modelCenter.z + beacon.z)
    group.add(record.root)
  }

  root.add(group)
}

/**
 * 白色科幻网格。网格本身会跟随模型平移（见渲染循环），
 * 而径向淡出在着色器里按"世界坐标到相机注视点(CAMERA_TARGET)的距离"计算，
 * 所以渐变范围始终以相机注视位置为中心，与网格自身的位置无关。
 */
function createGroundGrid(modelSize: THREE.Vector3) {
  const horizontal = Math.max(modelSize.x, modelSize.z) || 1
  const span = GRID_SPAN > 0 ? GRID_SPAN : horizontal * GRID_SPAN_RATIO
  const half = span / 2
  const step = span / GRID_DIVISIONS

  gridHalfSpan = half
  const fadeStart = half * GRID_FADE_START_RATIO
  const fadeEnd = Math.max(half * fadeEndRatioForDistance(distance), fadeStart + 1e-4)

  const positions: number[] = []
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const k = -half + i * step
    positions.push(-half, 0, k, half, 0, k) // 平行 X 轴
    positions.push(k, 0, -half, k, 0, half) // 平行 Z 轴
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(GRID_COLOR) },
      uOpacity: { value: GRID_OPACITY },
      uFadeCenter: { value: new THREE.Vector2(CAMERA_TARGET.x, CAMERA_TARGET.z) },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
      uFadeCurve: { value: GRID_FADE_CURVE },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec2 uFadeCenter;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uFadeCurve;
      varying vec3 vWorldPosition;
      void main() {
        float radius = distance(vWorldPosition.xz, uFadeCenter);
        float t = clamp((radius - uFadeStart) / max(uFadeEnd - uFadeStart, 1e-4), 0.0, 1.0);
        float alpha = pow(1.0 - t, uFadeCurve) * uOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  })

  // 网格位于 y = 0 平面，x/z 会跟随模型同步
  return new THREE.LineSegments(geometry, material)
}

function setupModel(loaded: THREE.Object3D) {
  if (!scene) return

  styleMaterials(loaded)
  scene.add(loaded)

  const box = new THREE.Box3().setFromObject(loaded)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  // 让模型中心落在 INITIAL_COORD，并让底面贴在网格平面(原点)上方一点点
  loaded.position.set(
    INITIAL_COORD.x - center.x,
    INITIAL_COORD.y + size.y / 2 - center.y + MODEL_GROUND_LIFT,
    INITIAL_COORD.z - center.z,
  )

  addWaterGlow(loaded, size)
  // 信标挂到模型上，随模型移动；位置相对模型中心、底部贴模型底面(box.min.y)
  addBeacons(loaded, center, box.min.y)

  model = loaded

  // 网格跟随模型：位置与模型保持一致（y 固定在地面平面）
  grid = createGroundGrid(size)
  grid.position.x = loaded.position.x
  grid.position.z = loaded.position.z
  scene.add(grid)

  // 相机初始参数：水平角由 CAMERA_BEARING_DEG 决定，缩放由 CAMERA_START_DISTANCE 决定
  distance = THREE.MathUtils.clamp(
    CAMERA_START_DISTANCE,
    CAMERA_MIN_DISTANCE,
    CAMERA_MAX_DISTANCE,
  )
  updateCamera()
}

function onPointerDown(event: PointerEvent) {
  canvasEl?.setPointerCapture(event.pointerId)
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size === 2) {
    const [p1, p2] = [...activePointers.values()]
    pinchDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    pinchMidX = (p1.x + p2.x) / 2
    pinchMidY = (p1.y + p2.y) / 2
    pointerMode = 'none'
    return
  }
  if (activePointers.size > 2) return

  // 右键拖拽 = 移动模型；左键拖拽 = 旋转（只改变方位角，不改变高度角）
  pointerMode = event.button === 2 ? 'pan' : 'rotate'
  lastX = event.clientX
  lastY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  // 无论是否在拖拽，都记录指针位置用于悬停检测
  if (canvasEl) {
    const rect = canvasEl.getBoundingClientRect()
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  if (!activePointers.has(event.pointerId)) return
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  // 双指：捏合缩放 + 整体平移
  if (activePointers.size >= 2) {
    const [p1, p2] = [...activePointers.values()]
    const currentDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2

    if (pinchDistance > 0 && currentDistance > 0) {
      zoomBy(pinchDistance / currentDistance)
    }
    panModelByPixels(midX - pinchMidX, midY - pinchMidY)

    pinchDistance = currentDistance
    pinchMidX = midX
    pinchMidY = midY
    return
  }

  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY

  if (pointerMode === 'rotate') {
    // 只改变水平角（罗盘朝向），不改变高度角
    bearing += dx * ORBIT_SPEED
    updateCamera()
  } else if (pointerMode === 'pan') {
    panModelByPixels(dx, dy)
  }
}

function onPointerUp(event: PointerEvent) {
  activePointers.delete(event.pointerId)
  if (canvasEl?.hasPointerCapture(event.pointerId)) {
    canvasEl.releasePointerCapture(event.pointerId)
  }

  if (activePointers.size < 2) pinchDistance = 0
  if (activePointers.size === 0) {
    pointerMode = 'none'
  } else {
    // 松开一根手指后，剩下的手指需要重新按下才继续操作，避免误触
    pointerMode = 'none'
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoomBy(Math.exp(event.deltaY * ZOOM_SPEED))
}

function onPointerLeave() {
  // 指针移出画布后不再悬停任何光柱
  pointerNdc.set(-2, -2)
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
}

function resize() {
  const container = containerRef.value
  if (!container || !renderer || !camera) return

  const width = container.clientWidth
  const height = container.clientHeight
  if (width === 0 || height === 0) return

  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  composer?.setPixelRatio(pixelRatio)
  composer?.setSize(width, height)
}

function init() {
  const container = containerRef.value
  if (!container) return

  const width = container.clientWidth || 1
  const height = container.clientHeight || 1
  const pixelRatio = Math.min(window.devicePixelRatio, 2)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1020)
  labelScene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(45, width / height, 10, 30000)
  updateCamera()

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  container.appendChild(renderer.domElement)
  canvasEl = renderer.domElement
  canvasEl.addEventListener('pointerdown', onPointerDown)
  canvasEl.addEventListener('pointermove', onPointerMove)
  canvasEl.addEventListener('pointerup', onPointerUp)
  canvasEl.addEventListener('pointercancel', onPointerUp)
  canvasEl.addEventListener('pointerleave', onPointerLeave)
  canvasEl.addEventListener('wheel', onWheel, { passive: false })
  canvasEl.addEventListener('contextmenu', onContextMenu)

  // 灯光：偏柔和，让白楼干净、水面不产生刺眼高光
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6)
  scene.add(hemisphere)

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
  keyLight.position.set(8, 14, 10)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
  fillLight.position.set(-10, 6, -8)
  scene.add(fillLight)

  // 后期：RenderPass -> Bloom -> OutputPass
  composer = new EffectComposer(renderer)
  composer.setPixelRatio(pixelRatio)
  composer.setSize(width, height)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(width, height),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    ),
  )
  composer.addPass(new OutputPass())

  const loader = new GLTFLoader()
  loader.load(
    MODEL_URL,
    (gltf) => setupModel(gltf.scene),
    undefined,
    (error) => {
      console.error('[BitnpMap] 加载模型失败:', error)
    },
  )

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  window.addEventListener('resize', resize)

  const renderLoop = () => {
    animationId = requestAnimationFrame(renderLoop)
    const delta = Math.min(beaconClock.getDelta(), 0.1)
    beaconElapsed += delta
    // 网格随模型一起移动（渐变中心固定在相机注视点，由着色器处理）
    if (grid && model) {
      grid.position.x = model.position.x
      grid.position.z = model.position.z
    }
    // 信标动画：共享粒子材质的时间
    if (beaconParticleMaterial) {
      beaconParticleMaterial.uniforms.uTime.value = beaconElapsed
      if (renderer) {
        beaconParticleMaterial.uniforms.uViewportHeight.value = renderer.domElement.height
      }
    }
    updateBeaconStates(delta)
    composer?.render()
    // 后期之后再画文字，使其完全不受辉光影响
    if (renderer && labelScene && camera) {
      renderer.autoClear = false
      renderer.render(labelScene, camera)
      renderer.autoClear = true
    }
  }
  renderLoop()
}

/** 释放材质，并顺带释放它引用的贴图（例如文字 Sprite 的 CanvasTexture） */
function disposeMaterial(material: THREE.Material) {
  const withMap = material as THREE.Material & { map?: THREE.Texture | null }
  withMap.map?.dispose()
  material.dispose()
}

/** 释放一棵对象树里的几何体与材质 */
function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((item) => disposeMaterial(item))
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function dispose() {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  resizeObserver?.disconnect()
  resizeObserver = null

  if (canvasEl) {
    canvasEl.removeEventListener('pointerdown', onPointerDown)
    canvasEl.removeEventListener('pointermove', onPointerMove)
    canvasEl.removeEventListener('pointerup', onPointerUp)
    canvasEl.removeEventListener('pointercancel', onPointerUp)
    canvasEl.removeEventListener('pointerleave', onPointerLeave)
    canvasEl.removeEventListener('wheel', onWheel)
    canvasEl.removeEventListener('contextmenu', onContextMenu)
    canvasEl = null
  }

  composer?.dispose()
  composer = null

  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }

  if (scene) disposeObjectTree(scene)
  if (labelScene) disposeObjectTree(labelScene)
  scene = null
  labelScene = null
  camera = null
  model = null
  grid = null
  beacons.length = 0
}

onMounted(init)
onBeforeUnmount(dispose)
</script>

<template>
  <div ref="containerRef" class="bitnp-map"></div>
</template>

<style scoped>
.bitnp-map {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.bitnp-map:active {
  cursor: grabbing;
}

.bitnp-map :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
