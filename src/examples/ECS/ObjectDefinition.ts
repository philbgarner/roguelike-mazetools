import { Entity } from "./Components";
import { ComponentRegistry } from "./Registry";


const PLAYER_INVENTORY_SIZE = 6
const ENEMY_INVENTORY_SIZE = 3
const CHEST_INVENTORY_SIZE = 4

export enum ObjectId {
    PLAYER = 0,
    MONSTER = 1,
    ENEMY = 2,
    ROOM = 3,
    CHEST = 4,
    SWORD = 5,
    BANDAGE = 6,
    TEA_CUP = 7
}

// Chest loot generation constants
const CHEST_SLOT_FILL_CHANCE = 0.6
const BANDAGE_SPAWN_CHANCE = 0.4
const SWORD_SPAWN_CHANCE = 0.3
const TEA_CUP_SPAWN_CHANCE = 0.3
const BANDAGE_MIN_COUNT = 3
const BANDAGE_MAX_COUNT = 8

// Define possible chest items with their spawn chances
const POSSIBLE_CHEST_ITEMS = [
    { type: ObjectId.BANDAGE, chance: BANDAGE_SPAWN_CHANCE, minCount: BANDAGE_MIN_COUNT, maxCount: BANDAGE_MAX_COUNT },
    { type: ObjectId.SWORD, chance: SWORD_SPAWN_CHANCE, minCount: 1, maxCount: 1 },
    { type: ObjectId.TEA_CUP, chance: TEA_CUP_SPAWN_CHANCE, minCount: 1, maxCount: 1 }
];

export enum TeaContent {
    EARL_GREY = "Earl Grey",
    GREEN = "Green",
    BLACK = "Black"
}

// Handle Object defintion entities
export function initializeObjectDefinitions(registry: ComponentRegistry) {
    addPlayerDefinition(registry);
    addMonsterDefinition(registry);
    addEnemyDefinition(registry);
    addRoomDefinition(registry);
    addChestDefinition(registry);
    addSwordDefinition(registry);
    addBandageDefinition(registry);
    addTeaCupDefinition(registry);
}

function createObjectDefinition(registry: ComponentRegistry, objectType: ObjectId, name: string) {
    const entityId = registry.createEntity();
    registry.components.objectDefinition.add(entityId, {
        objectType: objectType
    });
    registry.components.description.add(entityId, {
        name: name
    });
    registry.objectDefinitions[objectType] = entityId; // Store the definition entity for easy access
    return entityId;
}

function addPlayerDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.PLAYER, "Player");
}

function addMonsterDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.MONSTER, "Monster");
}

function addEnemyDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.ENEMY, "Enemy");
}

function addRoomDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.ROOM, "Room");
    registry.components.temperatureChange.add(entityId, {
        deltaTemperature: -0.5
    });
}

function addChestDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.CHEST, "Chest");
}

function addSwordDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.SWORD, "Sword");
    registry.components.weapon.add(entityId, {
        damage: 10
    });
}

function addBandageDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.BANDAGE, "Bandage");
    registry.components.stackable.add(entityId, {
        maxStack: 10
    });
    registry.components.heal.add(entityId, {
        amount: 10
    });
    registry.components.usable.add(entityId, {});
    registry.components.consummable.add(entityId, {});
}

function addTeaCupDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.TEA_CUP, "Tea Cup");
}

export function getObjectDefinition(registry: ComponentRegistry, objectType: ObjectId): Entity {
    return registry.objectDefinitions[objectType];
}

// Handle object instance creation
export function createObjectInstance(registry: ComponentRegistry, objectType: ObjectId) {
    const entityId = registry.createEntity();
    const definitionEntity = registry.objectDefinitions[objectType];
    
    if (!definitionEntity) {
        throw new Error(`Object definition for ${objectType} not found. Make sure initializeObjectDefinitions() was called.`);
    }
    
    registry.components.objectInstance.add(entityId, {
        definition: definitionEntity
    });
    return entityId;
}

export function createPlayerInstance(registry: ComponentRegistry) {
    const playerEntity = createObjectInstance(registry, ObjectId.PLAYER);
    registry.createInventory(playerEntity, PLAYER_INVENTORY_SIZE);
    initializePlayerInventory(registry, playerEntity);
    return playerEntity;
}

export function createEnemyInstance(registry: ComponentRegistry) {
    const enemyEntity = createObjectInstance(registry, ObjectId.ENEMY);
    registry.createInventory(enemyEntity, ENEMY_INVENTORY_SIZE);
    initializeEnemyInventory(registry, enemyEntity);
    return enemyEntity;
}

export function createChestInstance(registry: ComponentRegistry) {
    const chestEntity = createObjectInstance(registry, ObjectId.CHEST);
    registry.createInventory(chestEntity, CHEST_INVENTORY_SIZE);
    initializeChestInventory(registry, chestEntity);
    return chestEntity;
}

export function createTeaCupInstance(registry: ComponentRegistry, content: TeaContent) {
    const teaCupEntity = createObjectInstance(registry, ObjectId.TEA_CUP);
    
    // Add description component with tea type as name
    registry.components.description.add(teaCupEntity, {
        name: `Tea Cup (${content})`
    });
    
    switch (content) {
        case TeaContent.EARL_GREY:
            registry.components.temperature.add(teaCupEntity, {
                minTemperature: 20,
                maxTemperature: 100,
                currentTemperature: 80
            });
            break;
        case TeaContent.GREEN:
            registry.components.temperature.add(teaCupEntity, {
                minTemperature: 20,
                maxTemperature: 100,
                currentTemperature: 70
            });
            break;
        case TeaContent.BLACK:
            registry.components.temperature.add(teaCupEntity, {
                minTemperature: 20,
                maxTemperature: 100,
                currentTemperature: 90
            });
            break;
    }
    return teaCupEntity;
}

// Handle inventory initialization
export function initializePlayerInventory(registry: ComponentRegistry, player: Entity) {
    const playerInventories = registry.getInventoriesByOwner(player);
    if (playerInventories.length === 0) return;
    
    const playerInventory = playerInventories[0];
    const playerInventorySlots = registry.getFirstInventorySlots(player);
    
    // Check if inventory is already initialized to prevent re-initialization
    const existingItems = playerInventorySlots.filter(slot => registry.components.inventorySlot.get(slot)?.object);
    if (existingItems.length > 0) {
        return;
    }
    
    const inventory = registry.components.inventory.get(playerInventory);
    if (!inventory) return;
    
    // Add 5 bandages to first available slot
    const bandageEntity = getObjectDefinition(registry, ObjectId.BANDAGE);
    registry.addObjectToInventory(playerInventory, bandageEntity, 5);
    
    // Add sword to first available slot
    const swordEntity = getObjectDefinition(registry, ObjectId.SWORD);
    registry.addObjectToInventory(playerInventory, swordEntity, 1);
}

export function initializeEnemyInventory(registry: ComponentRegistry, enemy: Entity) {
    const enemyInventories = registry.getInventoriesByOwner(enemy);
    if (enemyInventories.length === 0) return;
    
    const enemyInventory = enemyInventories[0];
    const inventory = registry.components.inventory.get(enemyInventory);
    if (!inventory) return;
    
    // Add sword to first available slot
    const swordEntity = getObjectDefinition(registry, ObjectId.SWORD);
    registry.addObjectToInventory(enemyInventory, swordEntity, 1);
}

export function initializeChestInventory(registry: ComponentRegistry, chest: Entity) {
    const chestInventories = registry.getInventoriesByOwner(chest);
    if (chestInventories.length === 0) return;
    
    const chestInventory = chestInventories[0];
    const inventory = registry.components.inventory.get(chestInventory);
    if (!inventory) return;
    
    // Track which item types have been used to prevent duplicates
    const usedItemTypes = new Set<ObjectId>();
    
    // Generate items for each slot (with some randomness)
    for (let i = 0; i < inventory.slots.length; i++) {
        // 60% chance for each slot to contain an item
        if (Math.random() < CHEST_SLOT_FILL_CHANCE) {
            // Filter out already used item types
            const availableItems = POSSIBLE_CHEST_ITEMS.filter(item => !usedItemTypes.has(item.type));
            
            if (availableItems.length === 0) break; // No more unique items to place
            
            // Select a random item from available ones
            const selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
            usedItemTypes.add(selectedItem.type);
            
            let itemEntity;
            let quantity;
            
            if (selectedItem.type === ObjectId.TEA_CUP) {
                // Tea cup needs special handling for random taste
                const teaContents = Object.values(TeaContent);
                const randomTea = teaContents[Math.floor(Math.random() * teaContents.length)];
                itemEntity = createTeaCupInstance(registry, randomTea);
                quantity = 1;
            }
            else {
                // Use object definition for stackable items
                itemEntity = getObjectDefinition(registry, selectedItem.type);
                quantity = selectedItem.minCount + Math.floor(Math.random() * (selectedItem.maxCount - selectedItem.minCount + 1));
            }
            
            registry.addObjectToInventory(chestInventory, itemEntity, quantity);
        }
    }
}
