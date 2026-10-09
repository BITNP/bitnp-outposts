/** 光柱（信标）配置，作为 BitnpMap 的组件参数传入 */
export interface BeaconConfig {
  /** 稳定标识（可选） */
  id?: string
  /** 标注文字（同时用作默认标题） */
  label: string
  /** 相对"模型中心"的水平偏移：+X 东，+Z 南 */
  x: number
  z: number
  /** 点击该光柱（mousedown 与 mouseup 都悬停在它上面）后的回调 */
  onClick?: (beacon: BeaconConfig) => void
}
