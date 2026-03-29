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
    TEA_CUP = 6
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

function createObjectDefinition(registry: ComponentRegistry, objectType: ObjectId) {
    const entityId = registry.createEntity();
    registry.components.objectDefinition.add(entityId, {
        objectType: objectType
    });
    registry.objectDefinitions[objectType] = entityId; // Store the definition entity for easy access
    return entityId;
}

function addPlayerDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.PLAYER);
}

function addMonsterDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.MONSTER);
}

function addEnemyDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.ENEMY);
}

function addRoomDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.ROOM);
    registry.components.temperatureChange.add(entityId, {
        deltaTemperature: -0.5
    });
}

function addChestDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.CHEST);
}

function addSwordDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.SWORD);
    registry.components.weapon.add(entityId, {
        damage: 10
    });
}

function addBandageDefinition(registry: ComponentRegistry) {
    const entityId = createObjectDefinition(registry, ObjectId.BANDAGE);
    registry.components.stackable.add(entityId, {
        maxStack: 10
    });
    registry.components.heal.add(entityId, {
        amount: 10
    });
}

function addTeaCupDefinition(registry: ComponentRegistry) {
    createObjectDefinition(registry, ObjectId.TEA_CUP);
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

    return playerEntity;
}

export function createEnemyInstance(registry: ComponentRegistry) {
    const enemyEntity = createObjectInstance(registry, ObjectId.ENEMY);
    registry.createInventory(enemyEntity, ENEMY_INVENTORY_SIZE);

    return enemyEntity;
}

export function createChestInstance(registry: ComponentRegistry) {
    const chestEntity = createObjectInstance(registry, ObjectId.CHEST);
    registry.createInventory(chestEntity, CHEST_INVENTORY_SIZE);
    return chestEntity;
}

export function createTeaCupInstance(registry: ComponentRegistry, content: TeaContent) {
    const teaCupEntity = createObjectInstance(registry, ObjectId.TEA_CUP);
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
    const inventory = registry.components.inventory.get(player);
    if (!inventory) return;
    
    // Add 5 bandages to first available slot
    const bandageEntity = getObjectDefinition(registry, ObjectId.BANDAGE);
    registry.addObjectToInventory(player, bandageEntity, 5);
    
    // Add sword to first available slot
    const swordEntity = getObjectDefinition(registry, ObjectId.SWORD);
    registry.addObjectToInventory(player, swordEntity, 1);
}

export function initializeMonsterInventory(registry: ComponentRegistry, monster: Entity) {
    const inventory = registry.components.inventory.get(monster);
    if (!inventory) return;
    
    // Add sword to first available slot
    const swordEntity = getObjectDefinition(registry, ObjectId.SWORD);
    registry.addObjectToInventory(monster, swordEntity, 1);
}

export function initializeChestInventory(registry: ComponentRegistry, chest: Entity) {
    const inventory = registry.components.inventory.get(chest);
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
            
            registry.addObjectToInventory(chest, itemEntity, quantity);
        }
    }
}
