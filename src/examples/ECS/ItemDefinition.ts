import { Entity } from "./Components";
import { ComponentRegistry } from "./Registry";

export enum ItemIds {
    SWORD = 1,
    BANDAGE = 2,
    TEA_CUP = 3
}

export enum TeaContents {
    EARL_GREY = "Earl Grey",
    GREEN = "Green",
    BLACK = "Black"
}

// Handle Item defintion entities
export function initializeItemDefinitions(registry: ComponentRegistry) {
    addSwordDefinition(registry);
    addBandageDefinition(registry);
    addTeaCupDefinition(registry);
}

function createItemDefinition(registry: ComponentRegistry, itemType: ItemIds): Entity {
    const entityId = registry.createEntity();
    registry.components.itemDefinition.add(entityId, {
        itemType
    });
    registry.itemDefinitions[itemType] = entityId; // Store the definition entity for easy access
    return entityId;
}

function addSwordDefinition(registry: ComponentRegistry) {
    const entityId = createItemDefinition(registry, ItemIds.SWORD);
    registry.components.weapon.add(entityId, {
        damage: 10
    });
}

function addBandageDefinition(registry: ComponentRegistry) {
    const entityId = createItemDefinition(registry, ItemIds.BANDAGE);
    registry.components.stackable.add(entityId, {
        maxStack: 10
    });
    registry.components.heal.add(entityId, {
        amount: 10
    });
}

function addTeaCupDefinition(registry: ComponentRegistry) {
    createItemDefinition(registry, ItemIds.TEA_CUP);
}


// Handle item instance creation
export function createItemInstance(registry: ComponentRegistry, itemType: ItemIds): Entity {
    const entityId = registry.createEntity();
    const definitionEntity = registry.itemDefinitions[itemType];
    
    if (!definitionEntity) {
        throw new Error(`Item definition for ${itemType} not found. Make sure initializeItemDefinitions() was called.`);
    }
    
    registry.components.itemInstance.add(entityId, {
        definition: definitionEntity
    });
    return entityId;
}