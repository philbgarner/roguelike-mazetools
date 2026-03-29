import { ObjectId } from "./ObjectDefinition";

// Components - Pure data, no behavior
export type Entity = number; // Just an ID

//Item Definition components
export type ObjectDefinitionComponent = {
    objectType: ObjectId;
};

export type StackableComponent = {
    maxStack: number;
};

export type WeaponComponent = {
    damage: number;
};

export type HealComponent = {
    amount: number;
};

export type TemperatureChangeComponent = {
    deltaTemperature: number;
};

//TODO: Add other usable components when they are created
export enum UsableType {
    heal = 'heal',
    temperatureChange = 'temperatureChange'
}

export type UsableTagComponent = {};

export type ConsummableTagComponent = {};

// Item instance components -> Everything that represent a state that you can apply to an entity
export type ObjectInstanceComponent = {
    definition: Entity;
};

export type HealthComponent = {
    currentHealth: number;
    maxHealth: number;
};

export type TemperatureComponent = {
    currentTemperature: number;
    minTemperature: number;
    maxTemperature: number;
};

// Inventory components
export type InventoryComponent = {
    slots: Entity[];
};

export type InventorySlotComponent = {
    index: number;
    object: Entity | null;
    count: number;
};

export type HasOwnerComponent = {
    owner: Entity;
};
