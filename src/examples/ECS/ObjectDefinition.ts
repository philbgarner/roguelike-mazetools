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

function createObjectDefinition(registry: ComponentRegistry, objectType: ObjectId): Entity {
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

// Handle object instance creation
export function createObjectInstance(registry: ComponentRegistry, objectType: ObjectId): Entity {
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

export function createPlayerInstance(registry: ComponentRegistry): Entity {
    const playerEntity = createObjectInstance(registry, ObjectId.PLAYER);
    registry.createInventory(playerEntity, PLAYER_INVENTORY_SIZE);

    return playerEntity;
}

export function createEnemyInstance(registry: ComponentRegistry): Entity {
    const enemyEntity = createObjectInstance(registry, ObjectId.ENEMY);
    registry.createInventory(enemyEntity, ENEMY_INVENTORY_SIZE);

    return enemyEntity;
}

export function createChestInstance(registry: ComponentRegistry): Entity {
    const chestEntity = createObjectInstance(registry, ObjectId.CHEST);
    registry.createInventory(chestEntity, CHEST_INVENTORY_SIZE);
    return chestEntity;
}

export function createTeaCupInstance(registry: ComponentRegistry, content: TeaContent): Entity {
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
