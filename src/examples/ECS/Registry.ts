import { Entity, InventoryComponent, UsableType, HealthComponent, StackableComponent, WeaponComponent, TemperatureComponent, TemperatureChangeComponent, InventorySlotComponent, ItemDefinitionComponent, ItemInstanceComponent, HealComponent, ConsummableTagComponent, HasOwnerComponent, UsableTagComponent } from "./Components";
import { ItemIds } from "./ItemDefinition";

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
        itemDefinition: new ComponentStore<ItemDefinitionComponent>(),
        stackable: new ComponentStore<StackableComponent>(),
        weapon: new ComponentStore<WeaponComponent>(),
        heal: new ComponentStore<HealComponent>(),
        temperatureChange: new ComponentStore<TemperatureChangeComponent>(),
        usable: new ComponentStore<UsableTagComponent>(),
        consummable: new ComponentStore<ConsummableTagComponent>(),

        itemInstance: new ComponentStore<ItemInstanceComponent>(),
        health: new ComponentStore<HealthComponent>(),
        temperature: new ComponentStore<TemperatureComponent>(),

        inventory: new ComponentStore<InventoryComponent>(),
        inventorySlot: new ComponentStore<InventorySlotComponent>(),
        hasOwner: new ComponentStore<HasOwnerComponent>(),
    };

    // Store for pre-created item definitions
    itemDefinitions: Record<ItemIds, Entity> = {} as Record<ItemIds, Entity>;

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
    
    //Item methods
    getItemUses(entity: Entity): UsableType[] | undefined {
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
        const inventory = this.components.inventory.get(inventoryEntity)!;
        for (let i = 0; i < size; i++) {
            const slotEntity = this.createEntity();
            this.components.inventorySlot.add(slotEntity, {
                index: i,
                item: null,
                count: 0,
            });
            this.components.hasOwner.add(slotEntity, {
                owner: inventoryEntity
            });
            inventory.slots.push(slotEntity);
        }
    }

    slotHasItem(slotEntity: Entity) {
        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        return inventorySlot?.item !== null;
    }

    addItemToInventory(inventoryEntity: Entity, itemEntity: Entity, count: number = 1) {
        const inventory = this.components.inventory.get(inventoryEntity);

        if (inventory) {
            for (let i = 0; i < inventory.slots.length; i++) {
                const slot = inventory.slots[i];
                if (slot) {
                    const leftOver = this.addItemToSlot(slot, itemEntity, count);
                    if (leftOver === 0) {
                        return 0;
                    }
                    count = leftOver;
                }
            }
        }
        return count;
    }

    addItemToSlot(slotEntity: Entity, itemEntity: Entity, count: number = 1) {
        if (count <= 0) return count;

        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        if (!inventorySlot) return count;

        if (!inventorySlot.item) {
            inventorySlot.item = itemEntity;
            if (this.components.stackable.has(itemEntity)) {
                const stackable = this.components.stackable.get(itemEntity)!;
                inventorySlot.count = Math.min(count, stackable.maxStack);
                return count - inventorySlot.count;
            }
            else {
                inventorySlot.count = 1;
                return count - 1;
            }
        }
        else {
            if (this.components.itemInstance.has(inventorySlot.item) || this.components.itemInstance.has(itemEntity)) {
                return count;
            }

            const currentItemDef = this.components.itemDefinition.get(inventorySlot.item)!;
            const newItemDef = this.components.itemDefinition.get(itemEntity)!;
            const stackable = this.components.stackable.get(inventorySlot.item);

            if (currentItemDef.itemType !== newItemDef.itemType || !stackable) {
                return count;
            }

            const totalItems = inventorySlot.count + count;
            inventorySlot.count = Math.min(totalItems, stackable.maxStack);
            return totalItems - inventorySlot.count;
        }
    }

    removeItemFromSlot(slotEntity: Entity, quantity: number = 1) {
        if (quantity <= 0) return; // prevent negative removal

        const inventorySlot = this.components.inventorySlot.get(slotEntity);
        if (!inventorySlot || !inventorySlot.item) return; // nothing to remove

        // Might be interesting to think about handling case where quantity > count
        inventorySlot.count -= quantity;

        if (inventorySlot.count <= 0) {
            inventorySlot.item = null;
            inventorySlot.count = 0;
        }
    }

    exchangeItemInSlots(fromSlotEntity: Entity, toSlotEntity: Entity) {
        const fromSlot = this.components.inventorySlot.get(fromSlotEntity);
        const toSlot = this.components.inventorySlot.get(toSlotEntity);

        // If one of the slots is not defined or the slot we take from has nothing, return
        if (!fromSlot || !toSlot || !fromSlot.item) return;

        const fromSlotOwner = this.components.hasOwner.get(fromSlotEntity)!;
        const toSlotOwner = this.components.hasOwner.get(toSlotEntity)!;
        if (fromSlotOwner.owner !== toSlotOwner.owner) {
            this.moveItemFromSlotToInventory(fromSlotEntity, toSlotOwner.owner);
            return;
        }

        // They are from the same inventory
        if (!toSlot.item) {
            // Target slot is empty, move the item
            toSlot.item = fromSlot.item;
            toSlot.count = fromSlot.count;
            fromSlot.item = null;
            fromSlot.count = 0;
        }
        else {
            // Both slots have items, try to add to target slot first
            const leftOver = this.addItemToSlot(toSlotEntity, fromSlot.item, fromSlot.count);

            // If nothing was added (leftOver === fromSlot.count), exchange the two slots
            if (leftOver === fromSlot.count) {
                const tempItem = toSlot.item;
                const tempCount = toSlot.count;
                toSlot.item = fromSlot.item;
                toSlot.count = fromSlot.count;
                fromSlot.item = tempItem;
                fromSlot.count = tempCount;
            }
            else {
                // Some items were added, remove them from source slot
                const amountAdded = fromSlot.count - leftOver;
                this.removeItemFromSlot(fromSlotEntity, amountAdded);
            }
        }
    }   

    moveItemFromSlotToInventory(slotEntity: Entity, inventoryEntity: Entity) {
        const slot = this.components.inventorySlot.get(slotEntity);
        const inventory = this.components.inventory.get(inventoryEntity);
        if (slot && inventory) {
            const leftOver = this.addItemToInventory(inventoryEntity, slot.item!, slot.count);
            if (leftOver === slot.count) return;
            this.removeItemFromSlot(slotEntity, slot.count - leftOver);
        }
    }
}
