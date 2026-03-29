import { Entity } from "./Components";
import { ComponentRegistry } from "./Registry";

// SYSTEMS - Pure behavior, operate on entities with components
export class UseSystem {
  constructor(private registry: ComponentRegistry) { }

  // Main entry point: player uses object from inventory slot on target
  useObjectFromInventory(slotEntity: Entity, targetEntity: Entity) {
    // Find player's inventory (assuming player has InInventoryComponent)
    const slot = this.registry.components.inventorySlot.get(slotEntity);
    if (!slot || !slot.object) {
      return;
    }

    // Find object in the specified slot
    const objectInstance = this.registry.components.objectInstance.get(slot.object);
    const objectDefEntity = objectInstance?.definition ?? slot.object;
    const objectUsable = this.registry.components.usable.get(objectDefEntity);
    if (!objectUsable) {
      console.log(`Object ${slot.object} is not usable`);
      return;
    }

    // Use the object on the target
    this.useObject(objectDefEntity, targetEntity);

    // Handle consumable logic
    if (this.registry.components.consummable.has(objectDefEntity)) {
      this.registry.removeObjectFromSlot(slotEntity, 1);
    }
  }

  // Use object on target
  useObject(objectEntity: Entity, targetEntity: Entity) {
    const uses = this.registry.getObjectUses(objectEntity);

    if (!uses) {
      console.log(`Object ${objectEntity} has no uses`);
      return;
    }

    console.log(`Using object ${objectEntity} on target ${targetEntity}`);

    // Apply all effects
    for (const use of uses) {
      this.applyEffect(use, objectEntity, targetEntity);
    }
  }

  // Apply specific effect
  applyEffect(useType: string, objectEntity: Entity, targetEntity: Entity) {
    switch (useType) {
      case 'temperatureChange':
        this.applyTemperatureChange(objectEntity, targetEntity);
        break;
      case 'heal':
        this.applyHeal(objectEntity, targetEntity);
        break;
      default:
        console.log(`Unknown use type: ${useType}`);
        break;
    }
  }


  private applyTemperatureChange(objectEntity: Entity, targetEntity: Entity) {
    const temperatureChangeComponent = this.registry.components.temperatureChange.get(objectEntity);
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

  private applyHeal(objectEntity: Entity, targetEntity: Entity) {
    const healComponent = this.registry.components.heal.get(objectEntity);
    const targetHealth = this.registry.components.health.get(targetEntity);
    if (!healComponent || !targetHealth) return;

    console.log(`Applying heal: +${healComponent.amount} HP`);

    // Apply to target's health

    targetHealth.currentHealth = Math.min(targetHealth.currentHealth + healComponent.amount, targetHealth.maxHealth);
    console.log(`Target health: ${targetHealth.currentHealth}/${targetHealth.maxHealth}`);
  }
}