import { Entity } from "./Components";
import { ComponentRegistry } from "./Registry";

// SYSTEMS - Pure behavior, operate on entities with components
export class UseSystem {
  constructor(private registry: ComponentRegistry) { }

  // Main entry point: player uses item from inventory slot on target
  useItemFromInventory(slotEntity: Entity, targetEntity: Entity) {
    // Find player's inventory (assuming player has InInventoryComponent)
    const slot = this.registry.components.inventorySlot.get(slotEntity);
    if (!slot || !slot.item) {
      return;
    }

    // Find item in the specified slot
    const itemInstance = this.registry.components.itemInstance.get(slot.item);
    const itemDefEntity = itemInstance?.definition ?? slot.item;
    const itemUsable = this.registry.components.usable.get(itemDefEntity);
    if (!itemUsable) {
      console.log(`Item ${slot.item} is not usable`);
      return;
    }

    // Use the item on the target
    this.useItem(itemDefEntity, targetEntity);

    // Handle consumable logic
    if (this.registry.components.consummable.has(itemDefEntity)) {
      this.registry.removeItemFromSlot(slotEntity, 1);
    }
  }

  // Use item on target
  useItem(itemEntity: Entity, targetEntity: Entity) {
    const uses = this.registry.getItemUses(itemEntity);

    if (!uses) {
      console.log(`Item ${itemEntity} has no uses`);
      return;
    }

    console.log(`Using item ${itemEntity} on target ${targetEntity}`);

    // Apply all effects
    for (const use of uses) {
      this.applyEffect(use, itemEntity, targetEntity);
    }
  }

  // Apply specific effect
  private applyEffect(useType: string, itemEntity: Entity, targetEntity: Entity) {
    switch (useType) {
      case 'temperatureChange':
        this.applyTemperatureChange(itemEntity, targetEntity);
        break;
      case 'heal':
        this.applyHeal(itemEntity, targetEntity);
        break;
      default:
        console.log(`Unknown use type: ${useType}`);
        break;
    }
  }


  private applyTemperatureChange(itemEntity: Entity, targetEntity: Entity) {
    const temperatureChangeComponent = this.registry.components.temperatureChange.get(itemEntity);
    const targetTemperature = this.registry.components.temperature.get(targetEntity);
    if (!temperatureChangeComponent || !targetTemperature) return;

    console.log(`Applying temperature change: ${temperatureChangeComponent.deltaTemperature}°C`);

    // Apply to target's temperature
    const newTemp = Math.max(targetTemperature.minTemperature, Math.min(targetTemperature.maxTemperature, targetTemperature.currentTemperature + temperatureChangeComponent.deltaTemperature));
    if (newTemp === targetTemperature.currentTemperature) console.log(`Temperature of ${targetEntity} unchanged`);
    else {
      targetTemperature.currentTemperature = newTemp;
      console.log(`Target ${targetEntity} temperature changed to: ${targetTemperature.currentTemperature}°C`);
    }
  }

  private applyHeal(itemEntity: Entity, targetEntity: Entity) {
    const healComponent = this.registry.components.heal.get(itemEntity);
    const targetHealth = this.registry.components.health.get(targetEntity);
    if (!healComponent || !targetHealth) return;

    console.log(`Applying heal: +${healComponent.amount} HP`);

    // Apply to target's health

    targetHealth.currentHealth = Math.min(targetHealth.currentHealth + healComponent.amount, targetHealth.maxHealth);
    console.log(`Target health: ${targetHealth.currentHealth}/${targetHealth.maxHealth}`);
  }
}