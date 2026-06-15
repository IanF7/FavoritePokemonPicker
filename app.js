const STAGES = [100, 50, 25, 10, 5, 1];
const STORAGE_KEY = "favorite-pokemon-picker-state";

const grid = document.getElementById("pokemonGrid");
const stageText = document.getElementById("stageText");
const selectionCount = document.getElementById("selectionCount");
const nextButton = document.getElementById("nextButton");
const resetButton = document.getElementById("resetButton");
const searchInput = document.getElementById("searchInput");
const shinyToggle = document.getElementById("shinyToggle");
const selectedOnlyToggle = document.getElementById("selectedOnlyToggle");
const finalResult = document.getElementById("finalResult");

let allPokemon = [];
let pool = [];
let selectedIds = new Set();
let stageIndex = 0;
let showShiny = false;
let showSelectedOnly = false;
let completedRounds = {};
let finalGroupOrders = {};

init();

async function init() {
  const response = await fetch("data/pokemon.json");
  allPokemon = await response.json();

  const saved = loadState();

  if (saved) {
    stageIndex = saved.stageIndex ?? 0;
    selectedIds = new Set(saved.selectedIds ?? []);
    showShiny = saved.showShiny ?? false;
    showSelectedOnly = saved.showSelectedOnly ?? false;
    completedRounds = saved.completedRounds ?? {};
    finalGroupOrders = saved.finalGroupOrders ?? {};

    shinyToggle.checked = showShiny;
    selectedOnlyToggle.checked = showSelectedOnly;

    const poolIds = new Set(saved.poolIds ?? []);
    pool = allPokemon.filter(pokemon => poolIds.has(pokemon.id));

    if (pool.length === 0) {
      pool = [...allPokemon];
    }
  } else {
    pool = [...allPokemon];
  }

  bindEvents();

  if (stageIndex >= STAGES.length) {
    renderFinal();
  } else {
    render();
  }
}

function bindEvents() {
  searchInput.addEventListener("input", render);

  shinyToggle.addEventListener("change", () => {
    showShiny = shinyToggle.checked;
    saveState();

    if (stageIndex >= STAGES.length) {
      renderFinal();
    } else {
      render();
    }
  });

  selectedOnlyToggle.addEventListener("change", () => {
    showSelectedOnly = selectedOnlyToggle.checked;
    saveState();
    render();
  });

  nextButton.addEventListener("click", continueToNextStage);

  resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);

    pool = [...allPokemon];
    selectedIds = new Set();
    stageIndex = 0;
    showShiny = false;
    showSelectedOnly = false;
    completedRounds = {};
    finalGroupOrders = {};

    shinyToggle.checked = false;
    selectedOnlyToggle.checked = false;
    searchInput.value = "";

    finalResult.classList.add("hidden");

    render();
  });
}

function continueToNextStage() {
  const target = STAGES[stageIndex];

  if (selectedIds.size !== target) return;

  const selectedPokemon = pool.filter(pokemon => selectedIds.has(pokemon.id));
  completedRounds[`top${target}`] = selectedPokemon.map(pokemon => pokemon.id);

  pool = selectedPokemon;
  selectedIds = new Set();
  stageIndex += 1;
  searchInput.value = "";
  showSelectedOnly = false;
  selectedOnlyToggle.checked = false;

  if (stageIndex >= STAGES.length) {
    saveState();
    renderFinal();
  } else {
    saveState();
    render();
  }
}

function toggleSelection(id) {
  const target = STAGES[stageIndex];

  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else if (selectedIds.size < target) {
    selectedIds.add(id);
  }

  saveState();
  render();
}

function render() {
  finalResult.classList.add("hidden");
  grid.classList.remove("hidden");
  selectedOnlyToggle.disabled = false;

  const target = STAGES[stageIndex];
  const remaining = target - selectedIds.size;

  stageText.textContent =
    target === 1
      ? "Choose your single favorite Pokémon."
      : `Choose ${target} Pokémon from this round.`;

  selectionCount.textContent =
    remaining === 0
      ? `${selectedIds.size} selected`
      : `${selectedIds.size} selected, ${remaining} left`;

  nextButton.disabled = selectedIds.size !== target;
  nextButton.textContent = target === 1 ? "Finish" : "Continue";

  const query = searchInput.value.trim().toLowerCase();

  let visiblePokemon = pool;

  if (showSelectedOnly) {
    visiblePokemon = visiblePokemon.filter(pokemon => selectedIds.has(pokemon.id));
  }

  if (query) {
    visiblePokemon = visiblePokemon.filter(pokemon =>
      pokemon.name.toLowerCase().includes(query)
    );
  }

  grid.replaceChildren(...visiblePokemon.map(createPokemonCard));
}

function createPokemonCard(pokemon) {
  const isSelected = selectedIds.has(pokemon.id);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  button.title = isSelected
    ? `Unselect ${pokemon.name}`
    : `Select ${pokemon.name}`;

  if (isSelected) {
    button.classList.add("selected");
  }

  const img = document.createElement("img");
  img.alt = pokemon.name;
  img.loading = "lazy";
  img.src = getSprite(pokemon);

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = pokemon.name;

  button.append(img, name);
  button.addEventListener("click", () => toggleSelection(pokemon.id));

  return button;
}

function getSprite(pokemon) {
  if (showShiny && pokemon.shinySprite) return pokemon.shinySprite;
  if (pokemon.sprite) return pokemon.sprite;

  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='100%25' height='100%25' fill='%23ddd'/%3E%3C/svg%3E";
}

function getPokemonByIds(ids) {
  const pokemonById = new Map(allPokemon.map(pokemon => [pokemon.id, pokemon]));
  return ids
    .map(id => pokemonById.get(id))
    .filter(Boolean);
}

function subtractIds(ids, idsToRemove) {
  const removeSet = new Set(idsToRemove ?? []);
  return (ids ?? []).filter(id => !removeSet.has(id));
}

function reconcileFinalOrder(groupKey, defaultIds) {
  const savedOrder = finalGroupOrders[groupKey] ?? [];
  const defaultSet = new Set(defaultIds);

  const savedValidIds = savedOrder.filter(id => defaultSet.has(id));
  const missingIds = defaultIds.filter(id => !savedValidIds.includes(id));

  return [...savedValidIds, ...missingIds];
}

function getFinalSections() {
  const top1 = completedRounds.top1 ?? [];
  const top5 = completedRounds.top5 ?? [];
  const top10 = completedRounds.top10 ?? [];
  const top25 = completedRounds.top25 ?? [];
  const top50 = completedRounds.top50 ?? [];
  const top100 = completedRounds.top100 ?? [];

  return [
    {
      key: "top2to5",
      title: "Top 2-5",
      ids: subtractIds(top5, top1)
    },
    {
      key: "top6to10",
      title: "Top 6-10",
      ids: subtractIds(top10, top5)
    },
    {
      key: "top11to25",
      title: "Top 11-25",
      ids: subtractIds(top25, top10)
    },
    {
      key: "top26to50",
      title: "Top 26-50",
      ids: subtractIds(top50, top25)
    },
    {
      key: "top51to100",
      title: "Top 51-100",
      ids: subtractIds(top100, top50)
    }
  ];
}

function renderFinal() {
  const favorite = getPokemonByIds(completedRounds.top1 ?? [])[0];

  grid.replaceChildren();
  grid.classList.add("hidden");

  selectedOnlyToggle.disabled = true;
  stageText.textContent = "Your favorite Pokémon has been chosen.";
  selectionCount.textContent = "Drag Pokémon within each row to reorder your final rankings.";
  nextButton.disabled = true;
  nextButton.textContent = "Finished";

  finalResult.classList.remove("hidden");
  finalResult.innerHTML = "";

  if (!favorite) {
    finalResult.textContent = "No favorite was found. Try resetting and starting again.";
    return;
  }

  const hero = document.createElement("section");
  hero.className = "final-hero";

  const title = document.createElement("h2");
  title.textContent = `#1 Favorite: ${favorite.name}`;

  const img = document.createElement("img");
  img.src = getSprite(favorite);
  img.alt = favorite.name;

  hero.append(title, img);
  finalResult.append(hero);

  for (const sectionData of getFinalSections()) {
    const orderedIds = reconcileFinalOrder(sectionData.key, sectionData.ids);

    if (orderedIds.length === 0) continue;

    finalGroupOrders[sectionData.key] = orderedIds;

    const section = document.createElement("section");
    section.className = "final-section";

    const heading = document.createElement("h3");
    heading.textContent = sectionData.title;

    const list = document.createElement("div");
    list.className = "final-list";
    list.dataset.groupKey = sectionData.key;

    enableFinalListDragAndDrop(list);

    for (const pokemon of getPokemonByIds(orderedIds)) {
      list.append(createFinalPokemonCard(pokemon, sectionData.key));
    }

    section.append(heading, list);
    finalResult.append(section);
  }

  saveState();
}

function createFinalPokemonCard(pokemon, groupKey) {
  const card = document.createElement("div");
  card.className = "final-card";
  card.draggable = true;
  card.dataset.pokemonId = pokemon.id;
  card.dataset.groupKey = groupKey;
  card.title = `Drag ${pokemon.name} to reorder this group`;

  const img = document.createElement("img");
  img.src = getSprite(pokemon);
  img.alt = pokemon.name;
  img.loading = "lazy";
  img.draggable = false;

  const name = document.createElement("div");
  name.className = "final-card-name";
  name.textContent = pokemon.name;

  card.append(img, name);

  card.addEventListener("dragstart", event => {
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      pokemonId: pokemon.id,
      groupKey
    }));
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  return card;
}

function enableFinalListDragAndDrop(list) {
  list.addEventListener("dragover", event => {
    event.preventDefault();

    const draggingCard = document.querySelector(".final-card.dragging");
    if (!draggingCard || draggingCard.dataset.groupKey !== list.dataset.groupKey) {
      return;
    }

    const afterElement = getDragAfterElement(list, event.clientX);

    if (afterElement == null) {
      list.appendChild(draggingCard);
    } else {
      list.insertBefore(draggingCard, afterElement);
    }
  });

  list.addEventListener("drop", event => {
    event.preventDefault();

    const draggingCard = document.querySelector(".final-card.dragging");
    if (!draggingCard || draggingCard.dataset.groupKey !== list.dataset.groupKey) {
      return;
    }

    updateFinalGroupOrderFromDom(list);
  });
}

function getDragAfterElement(container, x) {
  const draggableElements = [
    ...container.querySelectorAll(".final-card:not(.dragging)")
  ];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;

    if (offset < 0 && offset > closest.offset) {
      return {
        offset,
        element: child
      };
    }

    return closest;
  }, {
    offset: Number.NEGATIVE_INFINITY,
    element: null
  }).element;
}

function updateFinalGroupOrderFromDom(list) {
  const groupKey = list.dataset.groupKey;

  finalGroupOrders[groupKey] = [
    ...list.querySelectorAll(".final-card")
  ].map(card => card.dataset.pokemonId);

  saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    stageIndex,
    poolIds: pool.map(pokemon => pokemon.id),
    selectedIds: [...selectedIds],
    showShiny,
    showSelectedOnly,
    completedRounds,
    finalGroupOrders
  }));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}