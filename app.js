(function () {
  "use strict";
  var API = "https://gdenkygewitokuihvjrs.supabase.co/rest/v1/rpc/";
  var KEY = "sb_publishable_l3LP8JGPSRGADQ-ZZXaynA_6VP2QccH";
  var STORE_KEY = "ameublement-gilly-code";
  var CATS = ["Salon", "Cuisine", "Chambre", "Salle de bain", "Électroménager", "Divers"];
  var fmt = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" });
  var state = { budget: null, items: [], code: null };
  var armedId = null, armTimer = null, pollTimer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function money(n) { return fmt.format(Math.round((Number(n) || 0) * 100) / 100); }
  function parsePrice(s) {
    var v = String(s || "").replace(/\s/g, "").replace("€", "").replace(",", ".");
    if (v === "") return NaN;
    var n = Number(v);
    return isFinite(n) && n >= 0 && n < 1000000 ? Math.round(n * 100) / 100 : NaN;
  }
  function safeUrl(u) { try { var x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : null; } catch (e) { return null; } }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "lien"; } }
  function store(get, val) {
    try { if (get) return localStorage.getItem(STORE_KEY); if (val == null) localStorage.removeItem(STORE_KEY); else localStorage.setItem(STORE_KEY, val); } catch (e) { return null; }
  }

  async function rpc(fn, args) {
    var res = await fetch(API + fn, {
      method: "POST",
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    var text = await res.text();
    var data = null; try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      var msg = (data && (data.message || data.hint)) || "";
      var err = new Error(msg || ("HTTP " + res.status));
      err.code = /invalid_code/.test(msg) ? "invalid_code" : /too_many_items/.test(msg) ? "full" : "error";
      throw err;
    }
    return data;
  }

  /* ---------- rendering ---------- */
  function renderSummary() {
    var budget = Number(state.budget) || 0, done = 0, planned = 0;
    state.items.forEach(function (it) { if (it.status === "done") done += it.price; else planned += it.price; });
    var left = budget - done - planned;
    $("v-budget").textContent = state.budget == null ? "—" : money(budget);
    $("v-done").textContent = money(done);
    $("v-planned").textContent = money(planned);
    $("v-left").textContent = state.budget == null ? "—" : money(left);
    $("v-left").classList.toggle("over", left < 0);
    var pd = budget > 0 ? Math.min(100, done / budget * 100) : 0;
    var pp = budget > 0 ? Math.min(100, (done + planned) / budget * 100) : 0;
    $("bar-done").style.width = pd + "%";
    $("bar-planned").style.width = pp + "%";
    $("pct").textContent = budget > 0 ? (left < 0 ? "Dépassement de " + money(-left) : Math.round(pp) + " % du budget engagé") : "";
  }

  function renderList() {
    var list = $("list"); list.textContent = "";
    if (!state.items.length) { list.appendChild(el("p", "empty", "Aucun achat pour l'instant. Ajoute le premier avec le formulaire ci-dessous.")); return; }
    var groups = {};
    state.items.forEach(function (it) { (groups[it.category] = groups[it.category] || []).push(it); });
    var order = CATS.concat(Object.keys(groups).filter(function (c) { return CATS.indexOf(c) < 0; }));
    var wrap = el("div"); wrap.style.display = "flex"; wrap.style.flexDirection = "column"; wrap.style.gap = "28px";
    order.forEach(function (cat) {
      var items = groups[cat]; if (!items) return;
      items.sort(function (a, b) { return (a.status === b.status ? 0 : a.status === "done" ? 1 : -1) || (a.createdAt - b.createdAt); });
      var g = el("div", "group"), head = el("div", "group-head");
      head.appendChild(el("h2", null, cat));
      head.appendChild(el("span", "num", money(items.reduce(function (s, i) { return s + i.price; }, 0))));
      g.appendChild(head);
      items.forEach(function (it) {
        var row = el("div", "row" + (it.status === "done" ? " done" : ""));
        var cb = el("input", "check"); cb.type = "checkbox"; cb.id = "cb-" + it.id; cb.checked = it.status === "done";
        cb.setAttribute("aria-label", "Marquer « " + it.name + " » comme acheté");
        cb.addEventListener("change", function () { toggle(it, cb); });
        row.appendChild(cb);
        var mid = el("div"); mid.style.minWidth = "0";
        mid.appendChild(el("div", "name", it.name));
        var meta = el("div", "meta");
        meta.appendChild(el("span", "tag", it.status === "done" ? "Acheté" : "Prévu"));
        if (it.store) meta.appendChild(el("span", null, it.store));
        var u = it.link && safeUrl(it.link);
        if (u) { var a = el("a", null, host(u)); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.appendChild(a); }
        mid.appendChild(meta); row.appendChild(mid);
        row.appendChild(el("div", "price num", money(it.price)));
        var del = el("button", "del", armedId === it.id ? "Confirmer" : "Retirer"); del.type = "button";
        if (armedId === it.id) del.classList.add("armed");
        del.addEventListener("click", function () { remove(it); });
        row.appendChild(del);
        g.appendChild(row);
      });
      wrap.appendChild(g);
    });
    list.appendChild(wrap);
  }

  function render() { renderSummary(); renderList(); }

  /* ---------- data ---------- */
  function applyState(data) {
    state.budget = data && data.budget != null ? Number(data.budget) : null;
    state.items = ((data && data.items) || []).map(function (x) {
      return {
        id: String(x.id), name: String(x.name || "Sans nom"), price: Number(x.price) || 0,
        store: x.store ? String(x.store) : "", category: x.category ? String(x.category) : "Divers",
        status: x.status === "done" ? "done" : "planned", link: x.link ? String(x.link) : "",
        createdAt: Date.parse(x.created_at) || 0
      };
    });
    render();
  }

  async function refresh(quiet) {
    try {
      applyState(await rpc("app_state", { p_code: state.code }));
      $("status").textContent = "";
    } catch (e) {
      if (e.code === "invalid_code") { lock("Le code n'est plus valide. Entre le nouveau code."); return; }
      if (!quiet) $("status").textContent = "La liste n'a pas pu être chargée. Vérifie ta connexion.";
    }
  }

  async function toggle(it, cb) {
    cb.disabled = true;
    try { await rpc("app_set_status", { p_code: state.code, p_id: it.id, p_status: cb.checked ? "done" : "planned" }); await refresh(); }
    catch (e) { cb.checked = !cb.checked; writeError(e); }
    cb.disabled = false;
  }

  async function remove(it) {
    if (armedId !== it.id) {
      armedId = it.id; clearTimeout(armTimer);
      armTimer = setTimeout(function () { armedId = null; renderList(); }, 4000);
      renderList(); return;
    }
    armedId = null; clearTimeout(armTimer);
    try { await rpc("app_delete_item", { p_code: state.code, p_id: it.id }); await refresh(); }
    catch (e) { writeError(e); renderList(); }
  }

  function writeError(e) {
    if (e.code === "invalid_code") { lock("Le code n'est plus valide. Entre le nouveau code."); return; }
    $("form-status").textContent = e.code === "full" ? "La liste est pleine : retire des articles avant d'en ajouter." : "L'enregistrement a échoué. Réessaie dans un instant.";
  }

  $("add-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var name = $("f-name").value.trim(), price = parsePrice($("f-price").value);
    if (!name) { $("form-status").textContent = "Indique le nom de l'article."; return; }
    if (isNaN(price)) { $("form-status").textContent = "Le prix doit être un nombre, par exemple 149,99."; return; }
    var raw = $("f-link").value.trim(), link = raw ? safeUrl(raw) : "";
    if (raw && !link) { $("form-status").textContent = "Le lien doit commencer par https://"; return; }
    $("f-submit").disabled = true;
    try {
      await rpc("app_add_item", {
        p_code: state.code, p_name: name.slice(0, 120), p_price: price,
        p_store: $("f-store").value.trim().slice(0, 60), p_category: $("f-cat").value,
        p_status: $("f-st-done").checked ? "done" : "planned", p_link: link || ""
      });
      $("f-name").value = ""; $("f-price").value = ""; $("f-store").value = ""; $("f-link").value = "";
      $("f-st-planned").checked = true;
      $("form-status").textContent = "Ajouté.";
      setTimeout(function () { $("form-status").textContent = ""; }, 2500);
      await refresh();
      $("f-name").focus();
    } catch (e) { writeError(e); }
    $("f-submit").disabled = false;
  });

  function showBudgetButton() {
    var box = $("budget-edit"); box.textContent = "";
    var b = el("button", null, "Modifier"); b.type = "button"; b.id = "budget-btn";
    b.addEventListener("click", openBudgetEditor); box.appendChild(b);
  }
  function openBudgetEditor() {
    var box = $("budget-edit"); box.textContent = "";
    var inp = el("input", "num"); inp.id = "budget-input"; inp.inputMode = "decimal";
    inp.value = state.budget != null ? String(state.budget).replace(".", ",") : "";
    inp.setAttribute("aria-label", "Nouveau budget en euros");
    var ok = el("button", null, "OK"); ok.type = "button";
    box.appendChild(inp); box.appendChild(ok); inp.focus();
    var busy = false;
    async function save() {
      if (busy) return; busy = true;
      var n = parsePrice(inp.value);
      if (!isNaN(n) && n !== state.budget) {
        try { await rpc("app_set_budget", { p_code: state.code, p_amount: n }); await refresh(); } catch (e) { writeError(e); }
      }
      showBudgetButton();
    }
    ok.addEventListener("click", save);
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") showBudgetButton();
    });
  }

  /* ---------- access ---------- */
  function lock(msg) {
    clearInterval(pollTimer); state.code = null; store(false, null);
    $("app").hidden = true; $("gate").hidden = false;
    $("g-status").textContent = msg || ""; $("g-code").value = ""; $("g-code").focus();
  }
  async function unlock(code, fromGate) {
    $("g-submit").disabled = true;
    try {
      var data = await rpc("app_state", { p_code: code });
      state.code = code; store(false, code);
      $("gate").hidden = true; $("app").hidden = false;
      showBudgetButton(); applyState(data);
      clearInterval(pollTimer);
      pollTimer = setInterval(function () { if (!document.hidden) refresh(true); }, 15000);
    } catch (e) {
      if (e.code === "invalid_code") lock(fromGate ? "Code incorrect." : "");
      else { $("gate").hidden = false; $("g-status").textContent = "Impossible de joindre la liste. Vérifie ta connexion."; }
    }
    $("g-submit").disabled = false;
  }

  $("gate").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var code = $("g-code").value.trim().toUpperCase();
    if (code) unlock(code, true);
  });
  $("logout").addEventListener("click", function () { lock(""); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.code) refresh(true); });

  var saved = store(true);
  if (saved) { $("gate").hidden = true; unlock(saved, false); } else { $("g-code").focus(); }
})();
