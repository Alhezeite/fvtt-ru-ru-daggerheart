// daggerheart-translate.js

const MODULE_ID = "ru-ru-daggerheart";
const TRANSLATION_PATH = `modules/${MODULE_ID}/translations`;

let translations = {};
let extraTranslations = {};

// ===== Загрузка переводов =====
async function loadTranslations() {
  // Грузим extra_all.json
  try {
    extraTranslations = await (await fetch(`${TRANSLATION_PATH}/extra_all.json`)).json();
    console.log(`${MODULE_ID} | Загружен extra_all.json`);
  } catch (e) {
    console.warn(`${MODULE_ID} | Не удалось загрузить extra_all.json`, e);
  }

  // Грузим все *_group.json
  const files = [
    "adversary_group.json",
    "ancestry_group.json",
    "beastform_group.json",
    "class_group.json",
    "community_group.json",
    "domain-card_group.json",
    "environment_group.json",
    "equipment_group.json",
    "extra_all.json",
    "subclass_group.json"
  ];

  for (let f of files) {
    try {
      const data = await (await fetch(`${TRANSLATION_PATH}/${f}`)).json();
      Object.assign(translations, data);
      console.log(`${MODULE_ID} | Загружен ${f}`);
    } catch (e) {
      console.warn(`${MODULE_ID} | Не удалось загрузить ${f}`, e);
    }
  }
}

// ===== Форматирование =====
function formatText(t) {
  if (!t) return "";
  return t.replace(/\r?\n/g, "<br>");
}

// ===== Применение перевода =====
function applyTranslation(doc) {
  if (!doc) return doc;

  const key = doc.original_name || doc.slug || doc.name;
  let tr = translations[key];

  if (tr) {
    if (tr.name) doc.name = tr.name;
    if (tr.description) {
      doc.system ??= {};
      doc.system.description = formatText(tr.description);
    }
  }

  // Перевод фич из extra_all.json
  if (doc.system?.actions && typeof doc.system.actions === "object") {
    for (let [id, action] of Object.entries(doc.system.actions)) {
      const extra = extraTranslations[action.name];
      if (extra) {
        if (extra.name) action.name = extra.name;
        if (extra.description) {
          action.description = formatText(extra.description);
        }
      }
    }
  }

  return doc;
}

// ===== Хуки и libWrapper =====
Hooks.once("ready", async function () {
  await loadTranslations();

  const wrap = (target, fn) => {
    if (game.modules.get("lib-wrapper")?.active) {
      libWrapper.register(MODULE_ID, target, fn, "WRAPPER");
    } else {
      const parts = target.split(".");
      let obj = globalThis;
      while (parts.length > 1) obj = obj[parts.shift()];
      const method = parts.shift();
      const orig = obj[method];
      obj[method] = function (...args) {
        return fn.call(this, orig.bind(this), ...args);
      };
    }
  };

  // Перевод при открытии документа из компендия
  wrap("CompendiumCollection.prototype.getDocument", async function (wrapped, ...args) {
    let doc = await wrapped(...args);
    return applyTranslation(doc);
  });

  // Перевод при импорте из компендия (drag&drop в папки)
  wrap("CompendiumCollection.prototype.importDocument", async function (wrapped, data, ...rest) {
    if (data && typeof data === "object") {
      applyTranslation(data);
    }
    return wrapped(data, ...rest);
  });

  // Перевод при fromCompendium (новые API Foundry)
  if (foundry.documents?.BaseItem?.fromCompendium) {
    wrap("foundry.documents.BaseItem.fromCompendium", async function (wrapped, data, ...rest) {
      applyTranslation(data);
      return wrapped(data, ...rest);
    });
  }

  if (foundry.documents?.BaseActor?.fromCompendium) {
    wrap("foundry.documents.BaseActor.fromCompendium", async function (wrapped, data, ...rest) {
      applyTranslation(data);
      return wrapped(data, ...rest);
    });
  }

  // Перевод при создании в документе (перетаскивание на лист)
  wrap("Actor.prototype.createEmbeddedDocuments", async function (wrapped, embeddedName, docs, ...rest) {
    if (embeddedName === "Item") {
      docs.forEach(applyTranslation);
    }
    return wrapped(embeddedName, docs, ...rest);
  });
});
