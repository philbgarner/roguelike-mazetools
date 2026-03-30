import { Entity, InventoryComponent, UsableType, HealthComponent, StackableComponent, WeaponComponent, TemperatureComponent, TemperatureChangeComponent, InventorySlotComponent, ObjectDefinitionComponent, ObjectInstanceComponent, HealComponent, ConsummableTagComponent, HasOwnerComponent, UsableTagComponent, InventoryOwnerComponent, DescriptionComponent } from "./Components";
import { initializeObjectDefinitions, ObjectId } from "./ObjectDefinition";

// Generic component storage
class ComponentStore<T> {
    private data = new Map<Entity, T>();

    add(entity: Entity, component: T) {
        this.data.set(entity, component);
    }

    get(entity: Entity): T | undefined {
        return this.data.get(entity);
    }

    remove(entity: Entity) {
        this.data.delete(entity);
    }

    has(entity: Entity): boolean {
        return this.data.has(entity);
    }

    entries() {
        return this.data.entries();
    }
    
    clear() {
        this.data.clear();
    }
}

export class ComponentRegistry {
    components = {
        objectDefinition: new ComponentStore<ObjectDefinitionComponent>(),
        stackable: new ComponentStore<StackableComponent>(),
        weapon: new ComponentStore<WeaponComponent>(),
        heal: new ComponentStore<HealComponent>(),
        temperatureChange: new ComponentStore<TemperatureChangeComponent>(),
        description: new ComponentStore<DescriptionComponent>(),
        usable: new ComponentStore<UsableTagComponent>(),
        consummable: new ComponentStore<ConsummableTagComponent>(),

        objectInstance: new ComponentStore<ObjectInstanceComponent>(),
        health: new ComponentStore<HealthComponent>(),
        temperature: new ComponentStore<TemperatureComponent>(),

        inventory: new ComponentStore<InventoryComponent>(),
        inventorySlot: new ComponentStore<InventorySlotComponent>(),
        hasOwner: new ComponentStore<HasOwnerComponent>(),
        inventoryOwner: new ComponentStore<InventoryOwnerComponent>(),
    };

    // Store for pre-created object definitions
    objectDefinitions: Record<ObjectId, Entity> = {} as Record<ObjectId, Entity>;

    currentEntity: number = 0;

    createEntity(): Entity {
        return ++this.currentEntity;
    }

    // If an entity has to be removed, we can get all its children to remove them as well
    getLinkedEntities(entity: Entity) {
        const entities: Entity[] = [];
        for (const [ownedEntity, hasOwner] of this.components.hasOwner.entries()) {
            if (hasOwner.owner === entity) {
                entities.push(ownedEntity);
            }
        }
        return entities;
    }

    removeEntity(entity: Entity, visited: Set<Entity> = new Set()) {
        // Prevent infinite recursion with visited set
        if (visited.has(entity)) {
            return;
        }
        visited.add(entity);

        // First, remove all linked entities recursively
        const linkedEntities = this.getLinkedEntities(entity);
        for (const linkedEntity of linkedEntities) {
            this.removeEntity(linkedEntity, visited);
        }

        // Then remove the entity itself
        for (const component of Object.values(this.components)) {
            component.remove(entity);
        }
    }

    cleanRegistry() {
        this.currentEntity = 0;
        for (const component of Object.values(this.components)) {
            component.clear();
        }
    }

    initializeRegistry() {
        initializeObjectDefinitions(this);
    }

    //Object methods
    getObjectUses(entity: Entity): UsableType[] | undefined {
        const uses: UsableType[] = [];
        for (const type of Object.values(UsableType)) {
            if (this.components[type].has(entity)) {
                uses.push(type);
            }
        }
        return uses.length > 0 ? uses : undefined;
    }

    //Inventory management
    createInventory(ownerEntity: Entity, size: number = 1) {
        const inventoryEntity = this.createEntity();
        this.components.inventory.add(inventoryEntity, {
            slots: [],
        });
        this.components.hasOwner.add(inventoryEntity, {
            owner: ownerEntity
        });
        if (this.components.inventoryOwner.has(ownerEntity)) {
            const inventoryOwner = this.components.inventoryOwner.get(ownerEntity)!;
            inventoryOwner.inventories.push(inventoryEntity);
        } else {
            this.components.inventoryOwner.add(ownerEntity, {
                inventories: [inventoryEntity]
            });
        }
        const inventory = this.components.inventory.get(inventoryEntity)!;
        for (let i = 0; i < size; i++) {
            const slotEntity = this.createEntity();
            this.components.inventorySlot.add(slotEntity, {
                index: i,
                object: null,
                count: 0,
            });
            this.components.hasOwner.add(slotEntity, {
                owner: inventoryEntity
            });
            inventory.slots.push(slotEntity);
        }
    }

    getInventoriesByOwner(ownerEntity: Entity): Entity[] {
        return this.components.inventoryOwner.get(ownerEntity)?.inventories || [];
    }

    getFirstInventorySlots(ownerEntity: Entity) {
        const inventories = this.getInventoriesByOwner(ownerEntity);
        return inventories.length > 0 ? this.components.inventory.get(inventories[0])?.slots ?? [] : [];
    }

    slotHasObject(slotEntity: Entity) {
        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        return inventorySlot?.object !== null;
    }

    addObjectToInventory(inventoryEntity: Entity, objectEntity: Entity, count: number = 1) {
        const inventory = this.components.inventory.get(inventoryEntity);

        if (inventory) {
            for (let i = 0; i < inventory.slots.length; i++) {
                const slot = inventory.slots[i];
                if (slot) {
                    const leftOver = this.addObjectToSlot(slot, objectEntity, count);
                    if (leftOver === 0) {
                        return 0;
                    }
                    count = leftOver;
                }
            }
        }
        return count;
    }

    addObjectToSlot(slotEntity: Entity, objectEntity: Entity, count: number = 1) {
        if (count <= 0) return count;

        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        if (!inventorySlot) return count;

        if (!inventorySlot.object) {
            inventorySlot.object = objectEntity;
            if (this.components.stackable.has(objectEntity)) {
                const stackable = this.components.stackable.get(objectEntity)!;
                inventorySlot.count = Math.min(count, stackable.maxStack);
                return count - inventorySlot.count;
            }
            else {
                inventorySlot.count = 1;
                return count - 1;
            }
        }
        else {
            if (this.components.objectInstance.has(inventorySlot.object) || this.components.objectInstance.has(objectEntity)) {
                return count;
            }

            const currentObjectDef = this.components.objectDefinition.get(inventorySlot.object)!;
            const newObjectDef = this.components.objectDefinition.get(objectEntity)!;
            const stackable = this.components.stackable.get(inventorySlot.object);

            if (currentObjectDef.objectType !== newObjectDef.objectType || !stackable) {
                return count;
            }

            const totalObjects = inventorySlot.count + count;
            inventorySlot.count = Math.min(totalObjects, stackable.maxStack);
            return totalObjects - inventorySlot.count;
        }
    }

    removeQuantityFromSlot(slotEntity: Entity, quantity: number = 1) {
        if (quantity <= 0) return; // prevent negative removal

        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        if (!inventorySlot || !inventorySlot.object) return; // nothing to remove

        // Might be interesting to think about handling case where quantity > count
        inventorySlot.count -= quantity;

        if (inventorySlot.count <= 0) {
            inventorySlot.object = null;
            inventorySlot.count = 0;
            console.log(`Slot ${slotEntity} is now empty`);
        }
    }

    removeObjectFromSlot(slotEntity: Entity) {
        const slot = this.components.inventorySlot.get(slotEntity);
        if (!slot) return;
        console.log(`Removing object from slot ${slotEntity}`);
        this.removeQuantityFromSlot(slotEntity, slot.count);
    }

    exchangeObjectInSlots(fromSlotEntity: Entity, toSlotEntity: Entity) {
        const fromSlot = this.components.inventorySlot.get(fromSlotEntity);
        const toSlot = this.components.inventorySlot.get(toSlotEntity);

        // If one of the slots is not defined or the slot we take from has nothing, return
        if (!fromSlot || !toSlot || !fromSlot.object) return;

        const fromSlotOwner = this.components.hasOwner.get(fromSlotEntity)!;
        const toSlotOwner = this.components.hasOwner.get(toSlotEntity)!;
        if (fromSlotOwner.owner !== toSlotOwner.owner) {
            this.moveObjectFromSlotToInventory(fromSlotEntity, toSlotOwner.owner);
            return;
        }

        // They are from the same inventory
        if (!toSlot.object) {
            // Target slot is empty, move the object
            toSlot.object = fromSlot.object;
            toSlot.count = fromSlot.count;
            fromSlot.object = null;
            fromSlot.count = 0;
        }
        else {
            // Both slots have objects, try to add to target slot first
            const leftOver = this.addObjectToSlot(toSlotEntity, fromSlot.object, fromSlot.count);

            // If nothing was added (leftOver === fromSlot.count), exchange the two slots
            if (leftOver === fromSlot.count) {
                const tempObject = toSlot.object;
                const tempCount = toSlot.count;
                toSlot.object = fromSlot.object;
                toSlot.count = fromSlot.count;
                fromSlot.object = tempObject;
                fromSlot.count = tempCount;
            }
            else {
                // Some objects were added, remove them from source slot
                const amountAdded = fromSlot.count - leftOver;
                this.removeQuantityFromSlot(fromSlotEntity, amountAdded);
            }
        }
    }   

    moveObjectFromSlotToInventory(slotEntity: Entity, inventoryEntity: Entity) {
        const slot = this.components.inventorySlot.get(slotEntity);
        const inventory = this.components.inventory.get(inventoryEntity);
        if (slot && inventory) {
            const leftOver = this.addObjectToInventory(inventoryEntity, slot.object!, slot.count);
            if (leftOver === slot.count) return;
            this.removeQuantityFromSlot(slotEntity, slot.count - leftOver);
        }
    }

    getSlotIndex(slotEntity: Entity) {
        const slot = this.components.inventorySlot.get(slotEntity);
        return slot?.index;
    }

    getSlotObjectName(slotEntity: Entity): string {
        const slot = this.components.inventorySlot.get(slotEntity);
        if (!slot || !slot.object) return "";
        
        let objectEntity: Entity;
        if (this.components.objectInstance.has(slot.object)) {
            objectEntity = this.components.objectInstance.get(slot.object)!.definition;
        } else {
            objectEntity = slot.object;
        }
        
        // Check if the object instance has a description component first
        if (this.components.description.has(slot.object)) {
            return this.components.description.get(slot.object)!.name;
        }
        
        // Fall back to description component on the definition
        return this.components.description.get(objectEntity)?.name || "";
    }

    getSlotQuantity(slotEntity: Entity): number {
        const slot = this.components.inventorySlot.get(slotEntity);
        if (!slot || !slot.object) return 0;
        return slot.count;
    }
}
