let mobsData = [];
let itemsData = {};
let gatherablesData = [];
let equipablesData = [];
let areasData = [];
let npcsData = [];

class Item {
  constructor(
    id,
    name,
    description,
    quantity,
    sprite,
    sell_value,
    buy_value,
    rarity,
    type
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.quantity = quantity;
    this.sprite = sprite;
    this.sell_value = sell_value;
    this.buy_value = buy_value;
    this.rarity = rarity;
    this.type = type;
  }

  static fromJSON(data) {
    return new Item(
      data.id,
      data.name,
      data.description,
      data.quantity || 1,
      data.sprite,
      data.sell_value,
      data.buy_value,
      data.rarity,
      data.type
    );
  }
}

class Entity {
  constructor(id, name, lootTable, sprite, parentId = null) {
    this.id = id;
    this.name = name;
    this.lootTable = lootTable;
    this.sprite = sprite;
    this.parentId = parentId;
    this.instanceId = `${id}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static fromJSON(data) {
    let lootTable = data['loot-table'] || [];
    const sprite = data['sprite'] || null;

    if (data['parent-id']) {
      const parent = Entity.getParentObject(data['parent-id']);
      if (parent) {
        lootTable = [...parent.lootTable, ...lootTable];
      }
    }

    return new Entity(data.id, data.name, lootTable, sprite, data['parent-id']);
  }

  static getParentObject(parentId) {
    const parentObjectData = mobsData.find((obj) => obj.id === parentId);
    if (parentObjectData) {
      return Entity.fromJSON(parentObjectData);
    }
    return null;
  }

  loot() {
    const items = [];
    const magicFindMultiplier = 1 + player.baseStats.magicFind * 0.001;

    this.lootTable.forEach((item) => {
      const roll = Math.random() * 100;
      const adjustedChance = item.chance * magicFindMultiplier;

      if (roll <= adjustedChance) {
        const quantity = Math.floor(
          Math.random() * (item.max - item.min + 1) + item.min
        );
        const itemData = itemsData[item.id] || equipablesData[item.id];
        if (itemData) {
          const newItem =
            itemData instanceof Equipable
              ? new Equipable(
                  itemData.id,
                  itemData.name,
                  itemData.description,
                  quantity,
                  itemData.sprite,
                  itemData.sell_value,
                  itemData.buy_value,
                  itemData.rarity,
                  itemData.type,
                  itemData.slot,
                  itemData.stats,
                  itemData.effects
                )
              : new Item(
                  itemData.id,
                  itemData.name,
                  itemData.description,
                  quantity,
                  itemData.sprite,
                  itemData.sell_value,
                  itemData.buy_value,
                  itemData.rarity,
                  itemData.type
                );
          items.push(newItem);
        }
      }
    });

    return items;
  }
}

class Mob extends Entity {
  constructor(
    id,
    name,
    lootTable,
    baseStats,
    gold,
    experience,
    level,
    sprite,
    parentId = null
  ) {
    super(id, name, lootTable, sprite, parentId);
    this.baseStats = { ...baseStats };
    this.gold = gold;
    this.experience = experience;
    this.level = level;
    this.maxHp = baseStats['health'];
    this.position = null;
  }

  static fromJSON(data) {
    const baseObject = Entity.fromJSON(data);
    const gold = data['gold'];
    const experience = data['experience'];
    const level = data['level'];
    const sprite = data['sprite'];

    return new Mob(
      baseObject.id,
      baseObject.name,
      baseObject.lootTable,
      data['base-stats'],
      gold,
      experience,
      level,
      sprite,
      baseObject.parentId
    );
  }

  receiveDamage(damageReceived) {
    let healthBeforeDamaging = this.baseStats['health'];

    if (this.baseStats['health'] - damageReceived <= 0) {
      this.die();
    } else {
      this.baseStats['health'] -= damageReceived;

      console.log(
        `${damageReceived} dmg has been dealt to ${this.name} (${healthBeforeDamaging} -> ${this.baseStats['health']})`
      );

      const healthDisplay = document.querySelector(
        `.health-display[data-instance-id="${this.instanceId}"]`
      );
      if (healthDisplay) {
        healthDisplay.textContent = `${this.baseStats['health']}/${this.maxHp}`;
      }

      showStatChange(-damageReceived, '#f5555d', healthDisplay);
    }
  }

  die() {
    console.log(`${this.name} has been killed and dropped: `);
    const loot = this.loot();
    console.log(loot);

    const square = document.querySelector(
      `.square[data-instance-id="${this.instanceId}"]`
    );
    if (square) {
      square.value = '';
      square.enemy = null;
      square.removeAttribute('data-instance-id');

      const enemyDiv = square.querySelector('.enemy');
      if (enemyDiv) {
        enemyDiv.remove();
      }

      const healthDisplay = document.querySelector(
        `.health-display[data-instance-id="${this.instanceId}"]`
      );
      if (healthDisplay) {
        healthDisplay.remove();
      }

      const levelNameDisplay = document.querySelector(
        `.level-name-display[data-instance-id="${this.instanceId}"]`
      );
      if (levelNameDisplay) {
        levelNameDisplay.remove();
      }

      console.log(`Enemy ${this.name} removed from square`);
    }

    player.addGold(loot.gold);
    player.addExperience(loot.experience, player.baseStats['combatWisdom']);
    loot.items.forEach((item) => player.addItem(item));
  }

  loot_experience() {
    return this.experience;
  }

  loot() {
    return {
      experience: this.loot_experience(),
      items: super.loot(),
    };
  }
}

class NPC extends Mob {
  constructor(
    id,
    name,
    lootTable,
    baseStats,
    gold,
    level,
    experience,
    dialogueOptions,
    sprite,
    parentId = null
  ) {
    super(id, name, lootTable, baseStats, gold, experience, level, sprite, parentId); 
    this.dialogueOptions = dialogueOptions;
    this.relationshipPoints = 0;
  }

  static fromJSON(data) {
    const baseObject = Mob.fromJSON(data);
    const dialogueOptions = data['dialogue-options'];
    const sprite = data['sprite'];

    return new NPC(
      baseObject.id,
      baseObject.name,
      baseObject.lootTable,
      baseObject.baseStats,
      baseObject.gold,
      baseObject.level,
      baseObject.experience,
      dialogueOptions,
      sprite,
      baseObject.parentId
    );
  }
}

class Gatherable extends Entity {
  constructor(
    id,
    name,
    lootTable,
    gatheringSpeed,
    gatheringPower,
    experience,
    sprite,
    parentId = null
  ) {
    super(id, name, lootTable, sprite, parentId);
    this.gatheringSpeed = gatheringSpeed;
    this.gatheringPower = gatheringPower;
    this.experience = experience;
    this.position = null;
  }

  static fromJSON(data) {
    const baseObject = Entity.fromJSON(data);
    const gatheringSpeed = data['gathering-speed'];
    const gatheringPower = data['gathering-power'];
    const experience = data['experience'];
    const sprite = data['sprite'];

    return new Gatherable(
      baseObject.id,
      baseObject.name,
      baseObject.lootTable,
      gatheringSpeed,
      gatheringPower,
      experience,
      sprite,
      baseObject.parentId
    );
  }

  gather() {
    console.log(`${this.name} is being gathered...`);
    const loot = this.loot();
    console.log(loot);

    const square = document.querySelector(
      `.square[data-instance-id="${this.instanceId}"]`
    );
    if (square) {
      square.value = '';
      square.gatherable = null;
      square.removeAttribute('data-instance-id');

      const gatherableDiv = square.querySelector('.gatherable');
      if (gatherableDiv) {
        gatherableDiv.remove();
      }

      const healthDisplay = document.querySelector(
        `.health-display[data-instance-id="${this.instanceId}"]`
      );
      if (healthDisplay) {
        healthDisplay.remove();
      }

      const levelNameDisplay = document.querySelector(
        `.level-name-display[data-instance-id="${this.instanceId}"]`
      );
      if (levelNameDisplay) {
        levelNameDisplay.remove();
      }

      console.log(`Gatherable ${this.name} removed from square`);
    }

    player.addExperience(loot.experience, player.baseStats['gatheringWisdom']);
    loot.items.forEach((item) => player.addItem(item));
  }

  loot_experience() {
    return this.experience;
  }

  loot() {
    return {
      experience: this.loot_experience(),
      items: super.loot(),
    };
  }
}

class Equipable extends Item {
  constructor(
    id,
    name,
    description,
    quantity,
    sprite,
    sell_value,
    buy_value,
    rarity,
    type,
    slot,
    stats,
    effects
  ) {
    super(
      id,
      name,
      description,
      quantity,
      sprite,
      sell_value,
      buy_value,
      rarity,
      type
    );
    this.slot = slot;
    this.stats = stats;
    this.effects = effects;
  }

  static fromJSON(data) {
    return new Equipable(
      data.id,
      data.name,
      data.description,
      data.quantity || 1,
      data.sprite,
      data.sell_value,
      data.buy_value,
      data.rarity,
      data.type,
      data.slot,
      data.stats,
      data.effects
    );
  }

  equip(player) {
    const currentEquip = player.equipment[this.slot];
    if (currentEquip) {
      currentEquip.unequip(player);
    }
    player.equipment[this.slot] = this;
    this.applyStats(player);
    console.log(`Equipped ${this.name} to ${this.slot} slot`);

    const slotElement = document.querySelector(
      `.equipment-slot[data-slot="${this.slot}"]`
    );
    if (slotElement) {
      slotElement.innerHTML = '';
      const img = document.createElement('img');
      img.src = this.sprite;
      img.alt = this.name;
      img.className = 'item-sprite';
      slotElement.appendChild(img);

      slotElement.draggable = true;
      slotElement.ondragstart = drag;
      slotElement.ondragend = dragEnd;
    }
  }

  unequip(player) {
    player.equipment[this.slot] = null;
    this.removeStats(player);

    const slotElement = document.querySelector(
      `.equipment-slot[data-slot="${this.slot}"]`
    );
    if (slotElement) {
      slotElement.innerHTML =
        this.slot.charAt(0).toUpperCase() + this.slot.slice(1);
      slotElement.draggable = false;
      slotElement.ondragstart = null;
      slotElement.ondragend = null;
    }
  }

  applyStats(player) {
    for (const [stat, value] of Object.entries(this.stats)) {
      player.baseStats[stat] += value;
      console.log(stat, value);
    }
    player.updateInventoryDisplay();
    console.log(player.baseStats);
  }

  removeStats(player) {
    for (const [stat, value] of Object.entries(this.stats)) {
      player.baseStats[stat] -= value;
    }
    player.updateInventoryDisplay();
  }
}

class Player {
  constructor(name) {
    this.name = name;
    this.baseStats = {
      health: 10,
      attack: 2,
      defense: 2,
      strength: 100,
      attackSpeed: 1,
      combatFortune: 0,
      combatWisdom: 1,
      gatheringSpeed: 1,
      gatheringPower: 1,
      gatheringFortune: 0,
      gatheringWisdom: 1,
      speed: 100,
      magicFind: 10,
    };
    this.gold = 0;
    this.experience = 0;
    this.level = 1;
    this.inventory = Array(14).fill(null);
    this.equipment = {
      helmet: null,
      chestplate: null,
      leggings: null,
      boots: null,
      talisman: null,
      necklace: null,
      cloak: null,
      gloves: null,
      ring: null,
      weapon: null,
      secondary: null,
    };
    this.position = { x: 0, y: 0 };
  }

  equipItem(equipable) {
    if (equipable instanceof Equipable) {
      console.log(
        `Equipping item: ${equipable.name} to slot: ${equipable.slot}`
      );
      equipable.equip(this);
      console.log(`${this.name} equipped ${equipable.name}`);
    } else {
      console.log(`${equipable.name} is not an equipable item`);
    }
  }

  unequipItem(slot) {
    const equipable = this.equipment[slot];
    if (equipable) {
      equipable.unequip(this);
      console.log(`${this.name} unequipped ${equipable.name}`);
    } else {
      console.log(`No item equipped in slot ${slot}`);
    }
  }

  addGold(amount) {
    this.gold += amount;
    this.updateInventoryDisplay();
    const goldElement = document.getElementById('player-gold-value');
    showStatChange(amount, '#ffc825', goldElement);
  }

  addExperience(amount, wisdom) {
    const amountWithWisdom = amount + amount * (wisdom / 10);
    this.experience += amountWithWisdom;
    this.checkLevelUp();
    const experienceElement = document.getElementById(
      'player-experience-value'
    );
    showStatChange(amountWithWisdom, '#99e65f', experienceElement);
  }

  checkLevelUp() {
    let leveledUp = false;
    while (this.experience >= this.getRequiredExperienceForNextLevel()) {
      this.experience -= this.getRequiredExperienceForNextLevel();
      this.level++;
      leveledUp = true;
      console.log(`${this.name} leveled up to level ${this.level}!`);
    }
    if (leveledUp) {
      this.onLevelUp();
    }
    this.updatePlayerStatsDisplay();
  }

  getRequiredExperienceForNextLevel() {
    return this.level * 100;
  }

  onLevelUp() {
    showEntrancesInfo();
    updateAreaInfo();
  }

  addItem(newItem) {
    const existingItem = this.inventory.find(
      (item) => item && item.id === newItem.id
    );
    if (existingItem) {
      existingItem.quantity += newItem.quantity;
    } else {
      const emptySlotIndex = this.inventory.findIndex((item) => item === null);
      if (emptySlotIndex !== -1) {
        this.inventory[emptySlotIndex] = newItem;
        const slotElement = document.querySelector(
          `.inventory-slot[data-slot-index="${emptySlotIndex}"]`
        );
        if (slotElement) {
          slotElement.classList.add('has-item');
          slotElement.draggable = true;
          slotElement.ondragstart = drag;
          slotElement.ondragend = dragEnd;
        }
      } else {
        console.log('Inventory is full!');
      }
    }
    this.updateInventoryDisplay();
  }

  removeItem(index) {
    this.inventory[index] = null;
    const slotElement = document.querySelector(
      `.inventory-slot[data-slot-index="${index}"]`
    );
    if (slotElement) {
      slotElement.classList.remove('has-item');
    }
    this.updateInventoryDisplay();
  }

  gather(gatherable) {
    if (this.baseStats.gatheringPower < gatherable.gatheringPower) {
      console.log(
        `You need to be at least level ${gatherable.gatheringPower} to gather ${gatherable.name}`
      );
      return;
    }

    console.log(`Gathering ${gatherable.name}...`);
    setTimeout(
      () => {
        gatherable.gather();
      },
      (gatherable.gatheringSpeed * 1000) / this.baseStats.gatheringSpeed
    );
  }

  updateInventoryDisplay() {
    const inventoryContainer = document.getElementById('inventory');

    inventoryContainer.innerHTML = '';

    this.inventory.forEach((item, index) => {
      const slot = createElement(
        'div',
        `inventory-slot ${item ? 'has-item' : ''}`,
        '',
        {
          'data-slot-index': index,
          draggable: item ? 'true' : 'false',
        }
      );

      slot.ondragstart = drag;
      slot.ondragend = dragEnd;
      slot.ondragover = allowDrop;
      slot.ondrop = drop;

      if (item) {
        if (item.sprite) {
          const img = createElement('img', 'item-sprite', '', {
            src: item.sprite,
            alt: item.name,
          });
          slot.appendChild(img);

          const quantity = createElement('span', 'item-quantity');
          quantity.textContent = item.quantity > 1 ? `x${item.quantity}` : '';
          slot.appendChild(quantity);
        } else {
          slot.textContent = `${item.name} x${item.quantity}`;
        }

        slot.addEventListener('mouseenter', (event) =>
          showTooltip(event, item)
        );
        slot.addEventListener('mouseleave', hideTooltip);
      }

      inventoryContainer.appendChild(slot);
    });

    const equipmentSlots = document.querySelectorAll('.equipment-slot');
    equipmentSlots.forEach((slot) => {
      slot.ondragover = allowDrop;
      slot.ondrop = drop;
      slot.ondragstart = drag;
      slot.ondragend = dragEnd;
    });

    const trashDiv = createElement('div', '', 'trash');
    trashDiv.textContent = 'Trash';
    trashDiv.ondrop = drop;
    trashDiv.ondragover = allowDrop;
    inventoryContainer.appendChild(trashDiv);
  }

  updatePlayerStatsDisplay() {
    const stats = [
      { id: 'player-level-value', value: this.level },
      {
        id: 'player-experience-value',
        value: `(${
          this.experience
        }/${this.getRequiredExperienceForNextLevel()})`,
      },
      { id: 'player-gold-value', value: this.gold },
      { id: 'player-magic-find-value', value: this.baseStats.magicFind },
      { id: 'player-attack-value', value: this.baseStats.attack },
      { id: 'player-defense-value', value: this.baseStats.defense },
      {
        id: 'player-health-value',
        value: `${this.baseStats.health}/${this.baseStats.health}`,
      },
      { id: 'player-strength-value', value: this.baseStats.strength },
      {
        id: 'player-attack-speed-value',
        value: this.baseStats.attackSpeed,
      },
      {
        id: 'player-combat-wisdom-value',
        value: this.baseStats.combatWisdom,
      },
      {
        id: 'player-gathering-wisdom-value',
        value: this.baseStats.gatheringWisdom,
      },
      { id: 'player-speed-value', value: this.baseStats.speed },
      {
        id: 'player-combat-fortune-value',
        value: this.baseStats.combatFortune,
      },
      {
        id: 'player-gathering-fortune-value',
        value: this.baseStats.gatheringFortune,
      },
      {
        id: 'player-gathering-power-value',
        value: this.baseStats.gatheringPower,
      },
      {
        id: 'player-gathering-speed-value',
        value: this.baseStats.gatheringSpeed,
      },
    ];

    stats.forEach(({ id, value }) => updateTextContent(id, value));
  }

  attack(enemy) {
    const damage = this.baseStats.attack + this.baseStats.strength / 2;
    enemy.receiveDamage(damage);
    console.log(`${this.name} dealt ${damage} damage to ${enemy.name}`);
  }
}

function drag(event) {
  hideTooltip();
  const fromElement = event.target.closest('.inventory-slot, .equipment-slot');
  const fromIndex = fromElement.dataset.slotIndex || fromElement.dataset.slot;
  const item = fromElement.classList.contains('inventory-slot')
    ? player.inventory[fromIndex]
    : player.equipment[fromIndex];

  event.dataTransfer.setData('text', fromIndex);
  document.body.style.cursor =
    "url('assets/sprites/cursors/computer-systems/hand-grab.png'), auto";
}

function dragEnd(event) {
  document.body.style.cursor =
    "url('assets/sprites/cursors/computer-systems/pointer.png'), auto";
}

function allowDrop(event) {
  event.preventDefault();
  const toElement = event.target.closest('.equipment-slot, .inventory-slot');

  if (toElement) {
    if (toElement.classList.contains('equipment-slot')) {
      event.dataTransfer.dropEffect = 'move';
    } else if (toElement.classList.contains('inventory-slot')) {
      event.dataTransfer.dropEffect = 'move';
    } else {
      event.dataTransfer.dropEffect = 'none';
    }
  } else {
    event.dataTransfer.dropEffect = 'none';
  }
}

function drop(event) {
  event.preventDefault();

  const indexOfDroppedItem = event.dataTransfer.getData('text');
  const elementBeingDropedOn = event.target.closest(
    '.equipment-slot, .inventory-slot'
  );
  const indexOfElementBeingDropedOn = elementBeingDropedOn.dataset.slotIndex;

  const itemBeingDroped =
    player.inventory[indexOfDroppedItem] ||
    player.equipment[indexOfDroppedItem];
  const itemDropedOn = player.inventory[indexOfElementBeingDropedOn];

  if (elementBeingDropedOn.classList.contains('equipment-slot')) {
    if (
      elementBeingDropedOn.dataset.slot == itemBeingDroped.slot &&
      !itemDropedOn
    ) {
      player.inventory[indexOfDroppedItem] =
        player.equipment[elementBeingDropedOn.dataset.slot];
      player.equipItem(itemBeingDroped);
    }
    player.updateInventoryDisplay();
    return;
  }

  if (!itemDropedOn) {
    if (itemBeingDroped == player.equipment[itemBeingDroped.slot]) {
      player.unequipItem(itemBeingDroped.slot);
    } else {
      player.inventory[indexOfDroppedItem] = null;
    }

    player.inventory[indexOfElementBeingDropedOn] = itemBeingDroped;
    player.updateInventoryDisplay();
    return;
  }

  if (
    itemBeingDroped instanceof Equipable &&
    itemDropedOn instanceof Equipable &&
    itemBeingDroped.slot != itemDropedOn.slot &&
    (player.equipment[itemBeingDroped.slot] == itemBeingDroped ||
      player.equipment[itemDropedOn.slot] == itemDropedOn)
  ) {
    return;
  }

  if (
    ((itemBeingDroped instanceof Equipable &&
      !(itemDropedOn instanceof Equipable)) ||
      (itemDropedOn instanceof Equipable &&
        !(itemBeingDroped instanceof Equipable))) &&
    (itemBeingDroped == player.equipment[itemBeingDroped.slot] ||
      itemDropedOn == player.equipment[itemDropedOn.slot])
  ) {
    return;
  }

  if (itemBeingDroped == player.equipment[itemBeingDroped.slot]) {
    player.unequipItem(itemBeingDroped.slot);
    player.equipItem(itemDropedOn);
  } else {
    player.inventory[indexOfDroppedItem] = itemDropedOn;
  }

  player.inventory[indexOfElementBeingDropedOn] = itemBeingDroped;
  player.updateInventoryDisplay();
}

function showTooltip(event, item) {
  hideTooltip();
  const tooltip = createElement('div', 'tooltip');

  const statsLabels = {
    health: 'Health',
    attack: 'Attack',
    defense: 'Defense',
    strength: 'Strength',
    attackSpeed: 'Attack Speed',
    combatFortune: 'Combat Fortune',
    combatWisdom: 'Combat Wisdom',
    gatheringSpeed: 'Gathering Speed',
    gatheringPower: 'Gathering Power',
    gatheringFortune: 'Gathering Fortune',
    gatheringWisdom: 'Gathering Wisdom',
    speed: 'Speed',
    magicFind: 'Magic Find',
  };

  const formatNumber = (num) => num.toLocaleString('en').replace(/,/g, ',');

  let statsHTML = item.stats
    ? Object.entries(statsLabels)
        .filter(
          ([key]) => item.stats[key] !== undefined && item.stats[key] !== 0
        )
        .map(([key, label]) => {
          const value = item.stats[key];
          const valueClass =
            value > 0 ? 'added-stat-value' : 'removed-stat-value';
          return `<span>${label}: <span id="${valueClass}">${
            value > 0 ? '+' : ''
          }${value}</span></span><br>`;
        })
        .join('')
    : '';

  let effectsHTML = item.effects
    ? Object.entries(item.effects)
        .map(
          ([key, description]) =>
            `<span id="ability-name">Effect: ${
              key.charAt(0).toUpperCase() + key.slice(1)
            }</span> <br><span id="ability-description">${description}</span></span><br>`
        )
        .join('')
    : '';

  console.log(effectsHTML);

  let sellPriceHTML =
    item.sell_value > 0
      ? `<span id="item-price-label">Sell Price:</span> 
               <span id="item-price">${formatNumber(
                 item.sell_value * item.quantity
               )} gold` +
        (item.quantity > 1
          ? ` (${formatNumber(item.sell_value)} gold per)`
          : '') +
        `</span><br>`
      : '';

  let buyPriceHTML =
    item.buy_value > 0
      ? `<span id="item-price-label">Buy Price:</span> 
               <span id="item-price">${formatNumber(
                 item.buy_value * item.quantity
               )} gold` +
        (item.quantity > 1
          ? ` (${formatNumber(item.buy_value)} gold per)`
          : '') +
        `</span><br>`
      : '';

  tooltip.innerHTML = [
    `<span id="item-rarity-${item.rarity}">${item.name}</span><br>`,
    `<i id="item-description">${item.description}</i><br><br>`,
    statsHTML ? `${statsHTML}<br>` : '',
    effectsHTML ? `${effectsHTML}<br>` : '',
    sellPriceHTML,
    buyPriceHTML,
    `<span id="item-rarity-${item.rarity}">`,
    `${item.rarity.toUpperCase()} ${item.type.toUpperCase()}</span>`,
  ].join('');

  document.body.appendChild(tooltip);

  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight}px`;
}

function hideTooltip() {
  const tooltip = document.querySelector('.tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

function switchPlayerView(viewId) {
  const viewElement = document.querySelector(`#${viewId}`);
  const allViews = document.querySelectorAll('.view');

  for (const view of allViews) {
    if (view.id == viewElement.id) view.style.display = '';
    else view.style.display = 'none';
  }

  if (document.querySelector('#statistics').style.display != 'none') {
    player.updatePlayerStatsDisplay();
  }
}

function initializeViews() {
  const allViews = document.querySelectorAll('.view');

  for (const view of allViews) {
    if (view.id == 'statistics') view.style.display = 'none';
  }
}

function getRandomEnemy(mobs) {
  const randomIndex = Math.floor(Math.random() * mobs.length);
  return Mob.fromJSON(mobs[randomIndex]);
}

const player = new Player('Hero');

function fetchData(url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.json();
    })
    .catch((error) => {
      console.log('There was a problem with the fetch operation:', error);
    });
}

function fetchAreas() {
  return fetchData('objects/areas.json').then((data) => {
    areasData = data;
  });
}

function fetchMobs() {
  return fetchData('objects/mobs.json').then((data) => {
    mobsData = data;
    spawnEnemies();
    console.log(data);
  });
}

function fetchItems() {
  return fetchData('objects/items.json').then((data) => {
    itemsData = data.reduce((acc, item) => {
      acc[item.id] = Item.fromJSON(item);
      return acc;
    }, {});
  });
}

function fetchGatherables() {
  return fetchData('objects/gatherables.json').then((data) => {
    gatherablesData = data;
    spawnGatherables();
  });
}

function fetchEquipables() {
  return fetchData('objects/equipables.json').then((data) => {
    equipablesData = data.reduce((acc, item) => {
      acc[item.id] = Equipable.fromJSON(item);
      return acc;
    }, {});
  });
}

function fetchNPCs() {
  return fetchData('objects/npcs.json').then((data) => {
    npcsData = data;
    spawnNPCs();
    console.log(data);
  });
}

function getCurrentArea() {
  const currentGameBoard = [...document.querySelectorAll('.game-board')].find(
    (el) => getComputedStyle(el).display !== 'none'
  );

  const currentAreaId = currentGameBoard.dataset.area;
  const currentArea = areasData.find((area) => area.id === currentAreaId);

  return currentArea;
}

function getCurrentAreaElement() {
  const currentArea = getCurrentArea();
  if (currentArea) {
    return document.querySelector(`.game-board[data-area="${currentArea.id}"]`);
  }
  return null;
}

function updateAreaInfo() {
  const currentArea = getCurrentArea();
  const dangerousness = getDangerousnessLevel(currentArea.level);
  if (!currentArea) {
    console.log('Current area not found');
    return;
  }

  updateTextContent(
    'area-name-label',
    dangerousness !== 'impossible'
      ? `[<span id="dangerousness-${dangerousness}">${currentArea.level}</span>] <span>${currentArea.name}</span>`
      : `[<span id='dangerousness-impossible'><img src='assets/sprites/icons/skull.png'></span>] <span>${currentArea.name}</span>`
  );
  updateTextContent('area-id-label', `(#${currentArea.id})`);

  const enemiesList = document.getElementById('enemies-list');
  enemiesList.innerHTML = '';
  currentArea.enemies.forEach((enemyId) => {
    const enemyData = mobsData.find((mob) => mob.id === enemyId);
    if (enemyData && enemyData.sprite) {
      createAndAppendElement(enemiesList, 'img', 'enemy-sprite', '', '', {
        src: enemyData.sprite,
        alt: enemyData.name,
      });
    } else {
      createAndAppendElement(enemiesList, 'span', '', '', enemyId);
    }
  });

  updateTextContent('gatherables-list', currentArea.gatherables.join(', '));
  updateTextContent('entrances-label', 'Entrances:');
  updateTextContent(
    'entrances-value',
    `${Object.keys(currentArea.entrances).length}`
  );
}

function getDangerousnessLevel(level) {
  const dangerousnessLevels = [
    'easy',
    'medium',
    'hard',
    'very-hard',
    'impossible',
  ];
  const dangerousnessIndex = Math.min(
    Math.floor(level / 20),
    dangerousnessLevels.length - 1
  );
  return dangerousnessLevels[dangerousnessIndex];
}

function spawnEntityForSquare(square, entityType) {
  if (square[entityType]) {
    console.log(
      `Square already has a ${entityType}: ${square[entityType].name}`
    );
    return;
  }

  const biome = Array.from(square.classList).find((cls) =>
    cls.endsWith('-biome')
  );
  if (!biome) {
    console.log('No biome found for square:', square);
    return;
  }
  const biomeId = biome.split('-')[0];

  const currentArea = getCurrentArea();
  if (!currentArea) {
    console.log('Current area not found');
    return;
  }

  const spawnableEntitiesInArea =
    currentArea[
      entityType === 'enemy'
        ? 'enemies'
        : entityType === 'gatherable'
          ? 'gatherables'
          : 'npcs'
    ];
  const spawnableEntities = (
    entityType === 'enemy'
      ? mobsData
      : entityType === 'gatherable'
        ? gatherablesData
        : npcsData
  )
    .filter((obj) => obj['biome-id'] === biomeId)
    .filter((obj) => spawnableEntitiesInArea.includes(obj.id));

  if (spawnableEntities.length > 0) {
    const newEntity =
      entityType === 'enemy'
        ? getRandomEnemy(spawnableEntities)
        : entityType === 'gatherable'
          ? Gatherable.fromJSON(
              spawnableEntities[
                Math.floor(Math.random() * spawnableEntities.length)
              ]
            )
          : NPC.fromJSON(
              spawnableEntities[
                Math.floor(Math.random() * spawnableEntities.length)
              ]
            );
    square.value = newEntity.id;
    square[entityType] = newEntity;
    square.setAttribute('data-instance-id', newEntity.instanceId);
    newEntity.position = {
      x: parseInt(square.dataset.coord.split(',')[0]),
      y: parseInt(square.dataset.coord.split(',')[1]),
    };

    createAndAppendElement(
      square,
      'div',
      `${entityType} ${newEntity.id}`,
      '',
      '',
      {
        'data-instance-id': newEntity.instanceId,
        style: {
          backgroundImage: `url(${newEntity.sprite})`,
        }
      }
    );

    const levelNameDisplay = createElement('div', 'level-name-display', '', {
      'data-instance-id': newEntity.instanceId,
    });
    if (newEntity.level) {
      const dangerousness = getDangerousnessLevel(newEntity.level);
      levelNameDisplay.innerHTML =
        dangerousness !== 'impossible'
          ? `[<span id="dangerousness-${dangerousness}">${newEntity.level}</span>] <span>${newEntity.name}</span>`
          : `[<span id='dangerousness-impossible'><img src='assets/sprites/icons/skull.png'></span>] <span>${newEntity.name}</span>`;
    } else {
      levelNameDisplay.innerHTML = newEntity.name;
    }
    square.appendChild(levelNameDisplay);

    if (entityType === 'enemy' || entityType === 'gatherable') {
      const healthDisplay = createElement('div', 'health-display', '', {
        'data-instance-id': newEntity.instanceId,
      });
      healthDisplay.textContent =
        entityType === 'enemy'
          ? `${newEntity.baseStats['health']}/${newEntity.maxHp}`
          : `${newEntity.gatheringSpeed}s`;
      square.appendChild(healthDisplay);
    }

    console.log(
      `Spawned ${newEntity.name} (#${newEntity.id}) in ${biome} square`
    );
  } else {
    console.log(`No spawnable ${entityType}s found for biome: ${biomeId}`);
  }
}

function spawnEnemies() {
  console.log('Spawning enemies...');
  const spawnableSquares =
    getCurrentAreaElement().querySelectorAll('.spawnable');
  spawnableSquares.forEach((square) => spawnEntityForSquare(square, 'enemy'));
}

function spawnGatherables() {
  console.log('Spawning gatherables...');
  const resourcefulSquares =
    getCurrentAreaElement().querySelectorAll('.resourceful');
  resourcefulSquares.forEach((square) =>
    spawnEntityForSquare(square, 'gatherable')
  );
}

function spawnNPCs() {
  console.log('Spawning NPCs...');
  const npctableSquares = getCurrentAreaElement().querySelectorAll('.npctable');
  npctableSquares.forEach((square) => spawnEntityForSquare(square, 'npc'));
}

function showNPCPopup(npc) {
  const gameBoard = document.querySelector('.game-board');

  const popupContainer = createAndAppendElement(gameBoard, 'div', 'npc-popup');
  const npcContainer = createAndAppendElement(
    popupContainer,
    'div',
    'npc-container'
  );
  const npcInfoContainer = createAndAppendElement(
    npcContainer,
    'div',
    'npc-info-container'
  );
  const npcConverstaionBox = createAndAppendElement(
    npcContainer,
    'div',
    'npc-converstaion-box'
  );
  createAndAppendElement(npcInfoContainer, 'img', 'npc-image', '', '', {
    src: `assets/sprites/entities/npcs/${npc.id}-portrait.png`,
  });
  createAndAppendElement(npcInfoContainer, 'p', 'npc-name', '', `${npc.name}`);
  createAndAppendElement(
    npcConverstaionBox,
    'p',
    'npc-dialogue',
    '',
    `placeholder dialogue`
  );
  const npcChoicesContainer = createAndAppendElement(
    npcConverstaionBox,
    'div',
    'npc-choices-container'
  );
  createAndAppendElement(
    npcChoicesContainer,
    'button',
    'npc-button',
    '',
    '1. Talk'
  );
  createAndAppendElement(
    npcChoicesContainer,
    'button',
    'npc-button',
    '',
    '2. Leave',
    {},
    {
      click: () => {
        popupContainer.remove();
        gameBoard.style.pointerEvents = 'auto';
        console.log('cya!');
      },
    }
  );
}

document.addEventListener('click', (event) => {
  const npcElement = event.target.closest('.npc');
  if (npcElement) {
    const npcInstanceId = npcElement.dataset.instanceId;
    const npc = npcsData.find((npc) => npc.instanceId === npcInstanceId);
    if (npc) {
      showNPCPopup(npc);
    }
  }
});

function isElementVisible(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

function isElementHidden(element) {
  return element.classList.contains('hidden');
}

function showEntrancesInfo() {
  const currentAreaElement = getCurrentAreaElement();
  if (!currentAreaElement) {
    console.log('Current area element not found');
    return;
  }

  const entrances = currentAreaElement.querySelectorAll('.entrance');
  entrances.forEach((entrance) => {
    while (entrance.firstChild) {
      entrance.removeChild(entrance.firstChild);
    }

    const entranceId = entrance.dataset.entranceid;
    const entranceData = getCurrentArea().entrances[entranceId];

    console.log(entrance.dataset.entranceid);
    console.log(getCurrentArea().entrances[entrance.dataset.entranceid]);

    const linkedArea = areasData.find((area) => area.id === entranceData);
    if (linkedArea) {
      console.log(`Linked area for entrance ${entranceId}:`, linkedArea);

      const dangerousness = getDangerousnessLevel(linkedArea.level);
      createAndAppendElement(
        entrance,
        'span',
        '',
        'area-info-display',
        dangerousness !== 'impossible'
          ? `[<span id="dangerousness-${dangerousness}">${linkedArea.level}</span>] <span>${linkedArea.name}</span>`
          : `[<span id='dangerousness-impossible'><img src='assets/sprites/icons/skull.png'></span>] <span>${linkedArea.name}</span>`
      );

      if (player.level < linkedArea.level) {
        createAndAppendElement(
          entrance,
          'span',
          '',
          'area-requirement-display',
          "You don't meet the requirements!"
        );
      } else {
        createAndAppendElement(
          entrance,
          'span',
          '',
          'area-enter-display',
          'Click to enter'
        );

        entrance.classList.remove('closed');
        entrance.classList.add('open');

        entrance.addEventListener('click', () => {
          const allAreas = document.querySelectorAll('.game-board');

          allAreas.forEach((area) => {
            if (linkedArea.id == area.dataset.area) {
              currentAreaElement.style.display = 'none';
              area.style.display = '';
              spawnGatherables();
              spawnEnemies();
              spawnNPCs();
              showEntrancesInfo();
            }
          });
        });
      }
    } else {
      console.log(`No linked area found for entrance ${entranceId}`);
    }
  });
}

function displayAreas() {
  const allAreas = document.querySelectorAll('.game-board');

  allAreas.forEach((area, index) => {
    area.style.display = index === 0 ? '' : 'none';
  });
}

fetchAreas()
  .then(fetchMobs)
  .then(fetchItems)
  .then(fetchGatherables)
  .then(fetchEquipables)
  .then(fetchNPCs)
  .then(showEntrancesInfo)
  .then(updateAreaInfo)
  .then(displayAreas)
  .catch((error) => {
    console.log('There was a problem with the fetch operation:', error);
  });

setInterval(spawnEnemies, 60000);
setInterval(spawnGatherables, 60000);

document.addEventListener('DOMContentLoaded', () => {
  console.log(
    'Document loaded. Adding event listeners to spawnable squares...'
  );
  const spawnableSquares = document.querySelectorAll('.spawnable');
  addEventListeners(spawnableSquares, 'click', (event) => {
    const square = event.target.closest('.square');
    const [x, y] = square.dataset.coord.split(',').map(Number);
    if (square.enemy) {
      player.attack(square.enemy);
    }
  });

  console.log(
    'Document loaded. Adding event listeners to resourceful squares...'
  );
  const resourcefulSquares = document.querySelectorAll('.resourceful');
  addEventListeners(resourcefulSquares, 'click', (event) => {
    const square = event.target.closest('.square');
    const [x, y] = square.dataset.coord.split(',').map(Number);
    if (square.gatherable) {
      player.gather(square.gatherable);
    }
  });

  console.log('Document loaded. Adding event listeners to npctable squares...');
  const npctableSquares = document.querySelectorAll('.npctable');
  addEventListeners(npctableSquares, 'click', (event) => {
    const square = event.target.closest('.square');
    const [x, y] = square.dataset.coord.split(',').map(Number);
    if (square.npc) {
      showNPCPopup(square.npc);
    }
  });

  player.updateInventoryDisplay();
  initializeViews();
});

function showStatChange(value, textColor, targetElement) {
  const rect = targetElement.getBoundingClientRect();
  const container = createElement('div', 'stat-change', '', {
    style: {
      position: 'absolute',
      left: `${rect.left + window.scrollX + rect.width / 2}px`,
      top: `${rect.top + window.scrollY - 20}px`,
      transform: 'translateX(-50%)',
      color: textColor,
    },
  });
  container.textContent = `${value > 0 ? '+' : ''}${value}`;
  document.body.appendChild(container);

  requestAnimationFrame(() => {
    const containerRect = container.getBoundingClientRect();
    container.style.left = `${
      rect.left + window.scrollX + rect.width / 2 - containerRect.width / 2
    }px`;
  });

  setTimeout(() => {
    container.remove();
  }, 1000);
}

function updateTextContent(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = text;
  }
}

function addEventListeners(elements, event, handler) {
  elements.forEach((element) => {
    element.addEventListener(event, handler);
  });
}

function createElement(
  tag,
  className = '',
  id = '',
  attributes = {},
  events = {}
) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (id) {
    element.id = id;
  }
  Object.keys(attributes).forEach((key) => {
    if (key === 'style') {
      Object.assign(element.style, attributes[key]);
    } else {
      element.setAttribute(key, attributes[key]);
    }
  });
  Object.keys(events).forEach((event) => {
    element.addEventListener(event, events[event]);
  });
  return element;
}

function createAndAppendElement(
  parent,
  tag,
  className = '',
  id = '',
  innerHTML = '',
  attributes = {},
  events = {}
) {
  const element = createElement(tag, className, id, attributes, events);
  element.innerHTML = innerHTML;
  parent.appendChild(element);
  return element;
}
