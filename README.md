# 纳斯达克上市股财报日历

一个纯本地静态网站，展示**全部纳斯达克上市股**的财报发布日期。

## 快速开始

1. 生成数据（首次或想手动刷新时）：
   ```bash
   node fetch-data.mjs
   ```
2. 双击打开 `index.html` 即可使用（无需服务器、无需联网）。

## 功能

- **月历视图**：按月展示，每天显示当天发布财报的公司（按市值排序），盘前/盘后用颜色区分。
- **按日期列表**：点击某天，侧栏显示当天完整财报列表（代码、公司、盘前/盘后、EPS 预期、行业、市值）。
- **筛选/搜索**：按股票代码/公司名搜索、按行业（中英双语）、市值区间、盘前/盘后筛选。
- **自选股关注**：点 ☆ 收藏公司（保存在本地浏览器），开启「只看自选」聚焦关注的公司。

## 数据说明

- **数据源**：纳斯达克公开 API（`api.nasdaq.com`），免费、无需 Key。
- **范围**：纳斯达克交易所（`exchange=nasdaq`）上市的全部股票（市值 > 0，约 3500 家）。
- **时间窗口**：默认抓取「今天前 7 天 ~ 今天后 60 天」。财报日期通常只提前 4~8 周公布，更远的日期尚不确定，因此窗口约 2 个月是合理上限。

## 每日自动刷新

两种方式任选其一：

**A. 本地自动刷新（macOS launchd，推荐，保持纯本地）**

```bash
bash install-auto-refresh.sh          # 安装：每 6 小时自动抓取一次
bash install-auto-refresh.sh --uninstall   # 卸载
```

日志写入同目录 `fetch.log`。开机自动恢复，无需保持终端开启。
想改抓取频率，用 `INTERVAL_SECONDS=10800 bash install-auto-refresh.sh`（10800 = 3 小时）。

**B. 在线自动刷新（GitHub Actions，可选）**

已提供 `.github/workflows/fetch-daily.yml`。把项目推送到 GitHub 并开启 GitHub Pages，
即可得到「在线访问 + 每天自动更新」的版本（每天美股盘前/盘后各抓取一次并提交更新）。

## 调整范围

编辑 `fetch-data.mjs` 顶部的常量：

| 常量 | 默认 | 说明 |
|---|---|---|
| `EXCHANGE` | `nasdaq` | 改为 `nyse` / `amex`，或清空以覆盖全美交易所 |
| `DAYS_BACK` / `DAYS_FORWARD` | `7` / `60` | 财报抓取窗口 |

> 注意：DELL、Medtronic、NIO 等公司实际在 **NYSE** 上市，`exchange=nasdaq` 时不会纳入。
> 若想覆盖全美交易所（含 NYSE），把 `EXCHANGE` 改为空字符串后重新抓取。

## 文件结构

```
index.html                 网站页面
styles.css                 样式（自动适配明/暗主题）
app.js                     交互逻辑（含行业中英对照）
data.js                    预生成数据（由 fetch-data.mjs 产出）
fetch-data.mjs             数据抓取脚本
install-auto-refresh.sh    本地自动刷新安装脚本（launchd）
.github/workflows/         在线自动刷新工作流（可选）
reference.html             调研参考文档（GitHub 类似项目 + 原型线框图）
```
