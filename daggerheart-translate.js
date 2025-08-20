// === Доменные карточки: перевод actions через libWrapper при перетаскивании ===
const MODULE_ID = "ru-ru-daggerheart";
const TRANSLATION_PATH = `modules/${MODULE_ID}/translations`;
const DOMAINS_FILE = `${TRANSLATION_PATH}/daggerheart.domains.json`;

let _domains = null;

async function loadDomains() {
  if (_domains) return _domains;
  try {
    const res = await fetch(DOMAINS_FILE);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    _domains = data?.entries || {};
    console.log(`${MODULE_ID} | Загружен перевод доменов: ${Object.keys(_domains).length} записей`);
  } catch (e) {
    console.warn(`${MODULE_ID} | Не удалось загрузить ${DOMAINS_FILE}`, e);
    _domains = {};
  }
  return _domains;
}

const br = t => (t ?? "").toString().replace(/\r?\n/g, "<br>");
const norm = s => (s ?? "")
  .toString()
  .normalize("NFKC")                  // унифицируем кавычки
  .replace(/[’‘`]/g, "'")
  .replace(/\s+/g, " ")
  .replace(/\s*\((?:attack|action|passive|reaction)[^)]+\)\s*$/i, "") // срежем хвосты вида (Attack)
  .trim()
  .toLowerCase();

/** Найти запись перевода домена по EN‑имени (ключу) или по RU‑имени (если Babele уже перевёл name) */
function pickDomainEntryFor(data, domains) {
  const byKey = data.original_name || data.slug || data.name;
  if (byKey && domains[byKey]) return domains[byKey];

  // запасной вариант: сравнить RU‑имя
  const ru = (data.name ?? "").toString().trim();
  if (!ru) return null;
  for (const entry of Object.values(domains)) {
    if ((entry?.name ?? "").toString().trim() === ru) return entry;
  }
  return null;
}

/** Применить перевод actions к *сырым данным* (до создания документа) */
function translateDomainCardActionsData(data, domains) {
  if (!data || data.type !== "domainCard") return;

  const trEntry = pickDomainEntryFor(data, domains);
  if (!trEntry || !Array.isArray(trEntry.actions) || trEntry.actions.length === 0) return;

  const actionsObj = data.system?.actions;
  if (!actionsObj || typeof actionsObj !== "object") return;

  // Индекс действий из предмета по нормализованному EN‑имени (как в компендии)
  const idxByName = {};
  for (const act of Object.values(actionsObj)) {
    const en = norm(act?.name);
    if (en) idxByName[en] = act;
  }

  for (const a of trEntry.actions) {
    // ключ для матчинга: сперва key (EN), иначе name (на случай, если в файле ключи не проставлены)
    const keyEN = norm(a.key || a.name || "");
    if (!keyEN) continue;

    // 1) точное совпадение
    let target = idxByName[keyEN];

    // 2) если не нашли — допускаем «Ice Spike» == «Ice Spike (Attack)»
    if (!target) {
      const hit = Object.values(actionsObj).find(act => norm(act.name).startsWith(keyEN));
      if (hit) target = hit;
    }

    if (!target) {
      // наглядная диагностика в консоль, чтобы сразу видеть, кто не сматчился
      console.warn(`${MODULE_ID} | Не найдено действие в предметe "${data.name}" для ключа:`, a.key || a.name);
      continue;
    }

    // Применяем перевод
    if (a.name)        target.name        = a.name;
    if (a.description) target.description = br(a.description);
  }
}

// Регистрируем обёртки ПОСЛЕ init (требование libWrapper)
Hooks.once("init", () => {
  if (!globalThis.libWrapper) {
    console.warn(`${MODULE_ID} | libWrapper не найден — перевод действий доменов работать не будет.`);
    return;
  }

  const wrap = (target, fn) => {
    try {
      libWrapper.register(MODULE_ID, target, fn, "WRAPPER");
      console.log(`${MODULE_ID} | wrapped ${target}`);
    } catch (e) {
      console.warn(`${MODULE_ID} | failed to wrap ${target}`, e);
    }
  };

  // 1) Импорт из компендия (drag → директории)
  wrap("CompendiumCollection.prototype.importDocument", async function (wrapped, data, ...rest) {
    const domains = await loadDomains();
    translateDomainCardActionsData(data, domains);
    return wrapped(data, ...rest);
  });

  // 2) Универсальный путь импорта источника
  wrap("Item.fromCompendium", async function (wrapped, data, ...rest) {
    const domains = await loadDomains();
    translateDomainCardActionsData(data, domains);
    return wrapped(data, ...rest);
  });

  // 2b) Для совместимости — возможный путь некоторых систем
  if (foundry?.documents?.BaseItem?.fromCompendium) {
    wrap("foundry.documents.BaseItem.fromCompendium", async function (wrapped, data, ...rest) {
      const domains = await loadDomains();
      translateDomainCardActionsData(data, domains);
      return wrapped(data, ...rest);
    });
  }

  // 3) Перетаскивание прямо на актёра (создание embedded Item)
  wrap("Actor.prototype.createEmbeddedDocuments", async function (wrapped, embeddedName, docs, ...rest) {
    const domains = await loadDomains();
    if (embeddedName === "Item" && Array.isArray(docs)) {
      for (const d of docs) translateDomainCardActionsData(d, domains);
    }
    return wrapped(embeddedName, docs, ...rest);
  });
});

Hooks.once('babele.init', (babele) => {
  babele.register({
    module: 'ru-ru-daggerheart',   
    lang: 'ru',                    
    dir: 'translations'            
  });
});
