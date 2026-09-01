/* ===================== 纳斯达克 Top1000 财报日历 ===================== */
(function () {
  "use strict";

  const DATA = window.__DATA__;
  if (!DATA) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:system-ui">数据文件 data.js 未找到。<br>请在项目目录运行 <code>node fetch-data.mjs</code> 生成数据。</div>';
    return;
  }

  const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const LS_WATCH = "nq-earnings-watchlist";
  const LS_THEME = "nq-earnings-theme";

  // 行业 英文 → 简体中文（GICS 分类）
  const SECTOR_ZH = {
    "Basic Materials": "基础材料",
    "Consumer Discretionary": "可选消费",
    "Consumer Staples": "日常消费",
    "Energy": "能源",
    "Finance": "金融",
    "Health Care": "医疗保健",
    "Industrials": "工业",
    "Miscellaneous": "综合",
    "Real Estate": "房地产",
    "Technology": "信息技术",
    "Telecommunications": "通信服务",
    "Utilities": "公用事业",
  };
  function sectorLabel(s) {
    if (!s || s === "—") return "—";
    const zh = SECTOR_ZH[s];
    return zh ? `${zh} · ${s}` : s;
  }

  // ---------- 工具 ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayStr() { return fmtDate(new Date()); }

  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

  function trimNum(s) { return s.replace(/\.0+$/, ""); }
  function formatCap(n) {
    if (n >= 1e12) return "$" + trimNum((n / 1e12).toFixed(2)) + "T";
    if (n >= 1e9) return "$" + trimNum((n / 1e9).toFixed(1)) + "B";
    if (n >= 1e6) return "$" + trimNum((n / 1e6).toFixed(1)) + "M";
    return "$" + Math.round(n);
  }
  function cnDate(dateStr) {
    const d = parseDate(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]}`;
  }
  function fmtGenerated(iso) {
    const d = new Date(iso);
    return `数据更新于 ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- 状态 ----------
  const state = {
    view: "calendar",
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDate: todayStr(),
    query: "",
    sector: "all",
    cap: "all",
    time: "all",
    watchOnly: false,
    watchlist: new Set(JSON.parse(localStorage.getItem(LS_WATCH) || "[]")),
  };

  // ---------- 市值分档 ----------
  function capBucket(mc) {
    if (mc >= 200e9) return "mega";
    if (mc >= 10e9) return "large";
    if (mc >= 2e9) return "mid";
    return "small";
  }

  // ---------- 过滤 ----------
  function matches(e) {
    if (state.watchOnly && !state.watchlist.has(e.symbol)) return false;
    if (state.time !== "all" && e.time !== state.time) return false;
    if (state.sector !== "all" && e.sector !== state.sector) return false;
    if (state.cap !== "all" && capBucket(e.marketCap) !== state.cap) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      if (!e.symbol.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }
  const filterList = (list) => (list || []).filter(matches);

  // ---------- 数据访问 ----------
  const earningsFor = (dateStr) => DATA.earningsByDate[dateStr] || [];

  // ---------- 渲染：KPI ----------
  function renderKPIs() {
    const t = todayStr();
    const all = DATA.earnings;
    const today = all.filter((e) => e.date === t);
    // 本周（周一 ~ 周日）
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 周一=0
    const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const week = all.filter((e) => {
      const d = parseDate(e.date);
      return d >= mon && d <= sun;
    });
    document.getElementById("kToday").textContent = today.length;
    document.getElementById("kWeek").textContent = week.length;
    document.getElementById("kBMO").textContent = today.filter((e) => e.time === "BMO").length;
    document.getElementById("kAMC").textContent = today.filter((e) => e.time === "AMC").length;
    document.getElementById("kCover").textContent = DATA.companies.length;
    document.getElementById("updatedAt").textContent = fmtGenerated(DATA.generatedAt);
  }

  // ---------- 渲染：侧栏 / 列表行 ----------
  function earnRowHtml(e) {
    const on = state.watchlist.has(e.symbol);
    const metaParts = [];
    if (e.epsForecast && e.epsForecast !== "—") metaParts.push("EPS " + e.epsForecast);
    if (e.noOfEsts) metaParts.push(e.noOfEsts + " 家预期");
    if (e.sector && e.sector !== "—") metaParts.push(sectorLabel(e.sector));
    const meta = metaParts.length ? `<div class="meta">${metaParts.join(" · ")}</div>` : "";
    return `
      <div class="earn-row">
        <button class="star-btn ${on ? "on" : ""}" data-sym="${e.symbol}" title="加入/移除自选">${on ? "★" : "☆"}</button>
        <span class="sym"><a href="https://www.nasdaq.com/market-activity/stocks/${e.symbol.toLowerCase()}" target="_blank" rel="noopener">${e.symbol}</a></span>
        <span class="nm">${escapeHtml(e.name)}${meta}</span>
        <span class="pill ${e.time}">${e.time}</span>
        <span class="mktcap">${formatCap(e.marketCap)}</span>
      </div>`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderSide() {
    const list = filterList(earningsFor(state.selectedDate));
    document.getElementById("sideDate").textContent = cnDate(state.selectedDate);
    document.getElementById("sideCount").textContent = `${list.length} 家`;
    const el = document.getElementById("sideList");
    if (!list.length) {
      el.innerHTML = `<div class="empty-hint">${state.selectedDate === todayStr() ? "今日暂无财报" : "当日暂无财报"}</div>`;
      return;
    }
    el.innerHTML = list.map(earnRowHtml).join("");
  }

  // ---------- 渲染：月历 ----------
  function renderCalendar() {
    const y = state.month.getFullYear();
    const m = state.month.getMonth();
    document.getElementById("calTitle").textContent = `${y}年${m + 1}月`;

    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // 周一开头
    const start = new Date(y, m, 1 - lead);
    const cells = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const ds = fmtDate(d);
      const inMonth = d.getMonth() === m;
      const list = filterList(earningsFor(ds));
      const isToday = ds === todayStr();
      const isSel = ds === state.selectedDate;

      let cls = "day-cell";
      if (!inMonth) cls += " other";
      if (isToday) cls += " today";
      if (isSel) cls += " selected";
      if (!list.length) cls += " empty";

      let inner = `<span class="d">${d.getDate()}</span>`;
      inner += list.slice(0, 3).map((e) => `<span class="tick"><span class="dot ${e.time.toLowerCase()}"></span>${e.symbol}</span>`).join("");
      if (list.length > 3) inner += `<span class="more">+${list.length - 3} 家</span>`;

      cells.push(`<div class="${cls}" data-date="${ds}">${inner}</div>`);
    }
    document.getElementById("calGrid").innerHTML = cells.join("");
  }

  // ---------- 渲染：列表视图 ----------
  function renderList() {
    const el = document.getElementById("listView");
    if (state.watchOnly && state.watchlist.size === 0) {
      el.innerHTML = `<div class="empty-hint" style="padding:40px">自选股为空 —— 在日历/列表里点 ☆ 收藏公司后，再开启「只看自选」。</div>`;
      return;
    }
    const filtered = filterList(DATA.earnings);
    // 按日期分组（保持输入已按日期升序）
    const groups = {};
    for (const e of filtered) (groups[e.date] ??= []).push(e);
    const dates = Object.keys(groups).sort();

    if (!dates.length) {
      el.innerHTML = `<div class="empty-hint" style="padding:40px">没有符合当前筛选条件的财报。</div>`;
      return;
    }
    el.innerHTML = dates
      .map((ds) => {
        const list = groups[ds].sort((a, b) => b.marketCap - a.marketCap);
        return `
          <div class="date-group">
            <div class="date-group-head">
              <h3>${cnDate(ds)}</h3>
              <span class="wd">${ds}</span>
              <span class="cnt">${list.length} 家</span>
            </div>
            ${list.map(earnRowHtml).join("")}
          </div>`;
      })
      .join("");
  }

  // ---------- 渲染：行业下拉 ----------
  function renderSectors() {
    const set = new Set();
    for (const c of DATA.companies) if (c.sector && c.sector !== "—") set.add(c.sector);
    const sorted = [...set].sort();
    const sel = document.getElementById("sectorSelect");
    sel.innerHTML = `<option value="all">全部行业 · All</option>` + sorted.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(sectorLabel(s))}</option>`).join("");
    sel.value = state.sector;
  }

  // ---------- 主渲染 ----------
  function render() {
    renderKPIs();
    renderCalendar();
    renderSide();
    renderList();
    // 视图切换
    document.getElementById("view-calendar").hidden = state.view !== "calendar";
    document.getElementById("view-list").hidden = state.view !== "list";
    document.querySelectorAll(".v-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    // 自选按钮状态
    document.getElementById("watchToggle").classList.toggle("on", state.watchOnly);
    document.getElementById("watchToggleLabel").textContent = state.watchOnly ? "只看自选 ✓" : "只看自选";
    // 时间分段状态
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.t === state.time));
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 视图切换
    document.getElementById("viewSwitch").addEventListener("click", (e) => {
      const b = e.target.closest(".v-btn");
      if (!b) return;
      state.view = b.dataset.view;
      render();
    });

    // 月份导航
    document.getElementById("prevMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
    document.getElementById("nextMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
    document.getElementById("todayBtn").addEventListener("click", () => {
      const n = new Date();
      state.month = new Date(n.getFullYear(), n.getMonth(), 1);
      state.selectedDate = todayStr();
      render();
    });

    // 点击日历某天
    document.getElementById("calGrid").addEventListener("click", (e) => {
      const cell = e.target.closest(".day-cell");
      if (!cell || !cell.dataset.date) return;
      state.selectedDate = cell.dataset.date;
      const d = parseDate(cell.dataset.date);
      state.month = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    });

    // 搜索
    let debounce;
    document.getElementById("searchInput").addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.query = e.target.value.trim(); render(); }, 120);
    });

    // 行业 / 市值 / 时间
    document.getElementById("sectorSelect").addEventListener("change", (e) => { state.sector = e.target.value; render(); });
    document.getElementById("capSelect").addEventListener("change", (e) => { state.cap = e.target.value; render(); });
    document.getElementById("timeSeg").addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      state.time = b.dataset.t;
      render();
    });

    // 自选
    document.getElementById("watchToggle").addEventListener("click", () => { state.watchOnly = !state.watchOnly; render(); });

    // 清空筛选
    document.getElementById("clearFilters").addEventListener("click", () => {
      state.query = ""; state.sector = "all"; state.cap = "all"; state.time = "all"; state.watchOnly = false;
      document.getElementById("searchInput").value = "";
      document.getElementById("sectorSelect").value = "all";
      document.getElementById("capSelect").value = "all";
      render();
    });

    // 收藏/取消收藏（事件委托）
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".star-btn");
      if (!btn) return;
      const sym = btn.dataset.sym;
      if (state.watchlist.has(sym)) state.watchlist.delete(sym);
      else state.watchlist.add(sym);
      localStorage.setItem(LS_WATCH, JSON.stringify([...state.watchlist]));
      render();
    });

    // 主题
    document.getElementById("themeToggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(LS_THEME, next);
      document.getElementById("themeToggle").textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  // ---------- 主题初始化 ----------
  function initTheme() {
    const saved = localStorage.getItem(LS_THEME);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = saved ? saved === "dark" : prefersDark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.getElementById("themeToggle").textContent = dark ? "☀️" : "🌙";
  }

  // ---------- 启动 ----------
  initTheme();
  renderSectors();
  bind();
  render();
})();
