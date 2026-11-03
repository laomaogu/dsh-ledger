<p align="center"><img src="icon.svg" width="72" height="72" alt="dsh-ledger icon"></p>

# 记账本 · dsh-ledger

> 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打造的个人记账插件：
> 记录每一笔收支，按**时间、分类、支付方式、星期、月度**五个维度分析消费，给出预算与异常提示，
> 并用内联 SVG 图表展示。数据只保存在本机，不上传。

[English](README.en.md) · [更新日志](CHANGELOG.md) · [发布指南](PUBLISHING.md) · [MIT License](LICENSE)

---

## 特性

- **快速记账**：支出 / 收入、金额、14 个固定分类、日期、5 种支付方式、备注；点按记录即可编辑，悬停删除（二次确认）。
- **五种图表维度**（纯 SVG / CSS，零图表依赖，跟随亮暗主题）：
  - 每日支出趋势（面积 + 折线，标出今天）
  - 支出构成环形图（分类占比 + 图例）
  - 支付方式横向条形图
  - 星期分布柱状图（工作日 / 周末区分）
  - 近六个月支出与收入对比柱状图
- **消费分析**：本月支出 / 收入 / 结余 / 日均 / 预算剩余，按剩余预算折算的每日额度，按当前速度预测月末支出。
- **自动提示**：根据数据生成最多 6 条建议（预算超支、分类上涨、环比变化、周末偏高、大额支出、重复消费、储蓄率等），警告优先展示。
- **对话记账**：向 Agent 注册 `ledger_add` / `ledger_report` / `ledger_delete` 三个工具，可以直接说「记一笔：午饭 25 元」「这个月花了多少」。
- **本地优先**：数据是一个 JSON 文件，原子写入、权限 `600`、可随时备份；HTTP 接口先经过 DSH 的 connection 信任检查。
- **中英双语**：面板文案与插件元数据均提供 `zh` / `en`。

## 界面（示意）

```
概览页（纵向滚动）
├─ KPI 行：本月支出 · 本月收入 · 本月结余 · 日均支出 · 预算剩余（含进度条）
├─ 本月小结：一句话概括本月
├─ 每日支出趋势（整行，面积 + 折线）
├─ 支出构成（左，环形图） · 消费提示（右，最多 6 条）
├─ 支付方式 · 星期分布 · 单笔排行（三列）
├─ 近六个月支出 / 收入对比（整行）
└─ 最近记录（整行，点按编辑 · 悬停删除）
```

页签：**概览** / **明细**（搜索、分类筛选）/ **设置**（月度预算、数据文件、导出 CSV / JSON）。

## 安装

### 方式一：插件管理器（推荐）

1. 打开 DSH Web 的「插件」页（左栏风车图标）。
2. 安装：选择本地目录，或填写本仓库地址 / npm 包名。
3. 在插件列表里启用 `dsh-ledger` 这个 bundle。
4. 左栏底部出现钱包图标 **记账本** 即安装成功。

### 方式二：命令行

```sh
# 本地目录（会创建 link 依赖）
dsh plugin --profile <profile> add /path/to/dsh-ledger

# 或直接从 GitHub 安装
dsh plugin --profile <profile> add github:<owner>/dsh-ledger
```

随后在「插件」页启用 `dsh-ledger` bundle（或让助手用插件管理器完成安装与启用）。

> 插件行 id 为 `personal-ledger`，包名为 `dsh-ledger`；两者都在
> [`cordis.patch.yml`](cordis.patch.yml) / [`package.json`](package.json) 中。

## 使用

- **记一笔**：右上角按钮 → 选类型、金额、分类、日期、支付方式、备注 → 保存。录入后自动跳到该笔账目所在月份。
- **看分析**：概览页按图表阅读；「本月小结」一句话概括本月。
- **找记录**：明细页搜索备注 / 分类 / 金额，按分类过滤；点记录编辑，悬停出现删除按钮。
- **设预算**：设置页填写月度预算（0 或留空表示不设），提示会据此变化。
- **导出**：设置页导出当前月份的 CSV / JSON。

### 对话记账

装上插件后可直接对助手说：

```
记一笔：午饭 25 元
昨天打车 38，用支付宝
这个月花了多少？帮我看看哪里可以省
删掉刚才那笔咖啡
```

| 工具 | 作用 |
|---|---|
| `ledger_add` | 记一笔支出 / 收入：`amount`（必填）、`type`、`category`、`date`、`method`、`note` |
| `ledger_report` | 某月汇总：总额、分类、支付方式、星期、环比、提示、最近 10 条记录（含 id） |
| `ledger_delete` | 按 id 删除一条记录 |

## 消费提示规则

最多 6 条，按 `warn → tip → ok → info` 排序。阈值可在 [`index.js`](index.js) 的 `buildInsights()` 中调整：

| 提示 | 触发条件 |
|---|---|
| 预算超支 / 紧张 / 健康 | 已用 ≥ 100% / ≥ 85% / 其余 |
| 每日额度 | 月中、未超预算时，剩余预算 ÷ 剩余天数 |
| 预计超支 | 按当前日均推算的月末支出 > 预算（且尚未超支） |
| 分类集中 | 第一大分类占比 ≥ 45% 且本月支出 ≥ 300 |
| 分类上涨 | 前三大分类中，某类 > 上月同类 × 1.3 且多花 ≥ 100 |
| 环比上升 / 下降 | 较上月多花 ≥ 25% 且 ≥ 100 / 少花 ≥ 20% 且 ≥ 100 |
| 周末偏高 | 周末日均 > 工作日日均 × 1.5 |
| 大额支出 | 最大单笔 ≥ 本月支出的 40% 且 ≥ 200 |
| 重复消费 | 同一备注（非空）当月出现 ≥ 4 次 |
| 结余 / 收支倒挂 | 有收入时结余 ≥ 0 / < 0；无收入且 ≥ 5 笔支出时提示补录收入 |
| 支付集中 | 使用 ≥ 3 种支付方式且第一种占比 ≥ 60%（支出 ≥ 500） |
| 日均参考 | 当月有已发生记录时 |

> 这些规则只是启发式建议，不构成财务建议。

## 数据与隐私

- 文件：`~/.dsh/personal-ledger/ledger.json`（目录 `700`、文件 `600`，UTF-8 JSON，写临时文件后原子替换）。
- 结构：

```json
{
  "version": 1,
  "budget": 5000,
  "entries": [
    {
      "id": "m1abc2def3",
      "type": "expense",
      "amount": 25.5,
      "date": "2026-11-03",
      "category": "food",
      "method": "wechat",
      "note": "午饭",
      "createdAt": "2026-11-03T04:00:00.000Z",
      "updatedAt": "2026-11-03T04:00:00.000Z"
    }
  ],
  "updatedAt": "2026-11-03T04:00:00.000Z"
}
```

- 坏了也不会丢：无法解析的 JSON 会被改名为 `ledger.json.corrupt-<时间戳>`，然后从空账本继续。
- **没有任何遥测**；唯一的外部调用是浏览器到本机 DSH 的同源 `fetch`。
- 删除无回收站；需要留档请先在设置页导出。

## 架构

```
浏览器（Client half, client.js）                 Host（index.js）
┌───────────────────────────┐   fetch    ┌──────────────────────────────┐
│ sidebar.panellist（图标）  │ ─────────▶ │ /dsh-ledger/api              │
│ main（整页面板）           │  同源 API  │  · connection 信任检查         │
│ · 概览 / 明细 / 设置       │ ◀───────── │  · 校验 + 存储（原子写）       │
│ · 5 种 SVG 图表            │  快照 JSON │  · 分析 + 提示规则            │
│ · 录入 / 编辑 / 删除       │            │  · Agent 工具（3 个）          │
└───────────────────────────┘            └──────────────┬───────────────┘
                                                        │
                                        ~/.dsh/personal-ledger/ledger.json
```

- **Host 负责唯一事实来源**：统计、占比、提示都在 `buildSnapshot()` 里算好，面板只负责渲染；Agent 工具与面板因此不会出现口径不一致。
- **HTTP**：`GET /dsh-ledger/api?month=YYYY-MM` 返回快照；`POST /dsh-ledger/api` 执行
  `{ op: "add" | "update" | "remove" | "setBudget", ... }` 并返回受影响月份的快照。
  两个入口都先调用 `connection.requestRejection(req)`，未认证请求直接 401/403。
- **Client 只依赖主题 token**（`--dsw-alias-*`）和浏览器内置的 React，不 import 任何 DSH Client 包。

## 开发

```sh
git clone <repo>
cd dsh-ledger

node --check index.js
node --check client.js
npm run check          # 同上

# 安装到某个 profile（会创建 link 依赖，改动即时生效）
dsh plugin --profile web add "$PWD"
```

目录：

```
dsh-ledger/
├── index.js            Host half：存储、分析、提示、HTTP API、Agent 工具
├── client.js           Client half：面板 / 图表 / 表单（window.__ModuleLoader__ 工厂）
├── cordis.patch.yml    插入 id=personal-ledger 的插件行
├── package.json        包清单（dsh.bundle + dsh.client）
├── locale/zh.json      插件管理器显示用元数据
├── locale/en.json
├── icon.svg            原始图标
└── README.md / README.en.md / CHANGELOG.md / LICENSE / PUBLISHING.md
```

调试提示：

- Host 启动时会打印 `[dsh-ledger] host ready: <数据文件>`，用于确认加载的是哪一代代码。
- 浏览器控制台可看到 slot 注册/崩溃信息；面板注册在 `main`（key `ledger`）与 `sidebar.panellist`（id `ledger`）。
- 修改 `client.js` 后刷新页面（或等待 HMR）即可看到变化；Host 改动需要重启 DSH 进程。

## 兼容性

- 开发与验证环境：DSH `0.2.1-rc.5`、Node `22.23.4`、Web GUI profile。
- `package.json`：`engines.node >= 22.19.0`，`engines.dsh ^0.2.1-alpha.2`。
- 只使用 Node 内置模块（`node:fs/promises`、`node:os`、`node:path`），无第三方运行时依赖。

## 已知限制

- 单币种（人民币 `¥`），金额上限 10 亿、备注 120 字、最多 5 万条记录。
- 分类固定为内置集合，UI 暂不支持自定义分类。
- Agent 工具的报告文本目前固定中文（面板本身中英双语）。
- 无账单导入、无多账户 / 多人共享。
- 面板每 25 秒或窗口重新聚焦时刷新一次，不是实时推送。

## Roadmap

- [ ] 自定义分类与多币种
- [ ] 支付宝 / 微信账单 CSV 导入
- [ ] 提示阈值可配置（放进插件 `Config`）
- [ ] 年度对比、日历热力图
- [ ] 截图与演示 GIF

## License

[MIT](LICENSE) © 2026 dsh-ledger contributors
