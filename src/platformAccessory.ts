import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';
import { SharpSerial } from './platform';
import { SerialProtocol } from './protocols/serial';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Television {
  private service: Service;

  // We will cache the current input since it cannot be queried while TV is off
  private states = {
    ActiveIdentifier: 0,
  }

  private readonly path: string;
  private readonly serial: SerialProtocol;

  constructor(
    private readonly platform: SharpSerial,
    private readonly accessory: PlatformAccessory,
  ) {
    this.path = accessory.context.device.path || '/dev/ttyUSB0';

    // Initialize Serial Port
    this.serial = new SerialProtocol(this.path, this.platform.log);

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        accessory.context.device.manufacturer || 'Sharp',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device.model || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device.serial || 'Unknown',
      );

    // get the Television service if it exists, otherwise create a new Television service
    this.service =
      this.accessory.getService(this.platform.Service.Television) ??
      this.accessory.addService(this.platform.Service.Television);

    // set the configured name, this is what is displayed as the default name on the Home app
    // we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.ConfiguredName,
      accessory.context.device.name,
    );

    // set sleep discovery characteristic
    this.service.setCharacteristic(
      this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Television

    // register handlers for the Active Characteristic (on / off events)
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, this.setActive.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getActive.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the ActiveIdentifier Characteristic (input events)
    this.service
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on(CharacteristicEventTypes.SET, this.setActiveIdentifier.bind(this)) // SET - bind to the 'setActiveIdentifier` method below
      .on(CharacteristicEventTypes.GET, this.getActiveIdentifier.bind(this)); // GET - bind to the `getActiveIdentifier` method below

    // register inputs
    accessory.context.device.inputs && accessory.context.device.inputs.forEach(
      (
        input: {
          id: string;
          name: string;
          type: number; // See InputSourceType from hap-nodejs
        },
        i: number,
      ) => {
        const inputService = accessory.addService(
          this.platform.Service.InputSource,
          input.name,
          input.name,
        );
        inputService
          .setCharacteristic(this.platform.Characteristic.Identifier, i)
          .setCharacteristic(
            this.platform.Characteristic.ConfiguredName,
            input.name,
          )
          .setCharacteristic(
            this.platform.Characteristic.IsConfigured,
            this.platform.Characteristic.IsConfigured.CONFIGURED,
          )
          .setCharacteristic(
            this.platform.Characteristic.InputSourceType,
            input.type,
          );
        this.service.addLinkedService(inputService);
      },
    );
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setActive(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    const command = value ? 'POWR1   \r' : 'POWR0   \r';

    this.serial.send(command, (data: string) => {
      if (data.includes('OK')) {
        this.platform.log.debug('Set Characteristic Active ->', value);

        // the first argument of the callback should be null if there are no errors
        callback(null);
      } else {
        const errorMessage = `While attempting to set the power state, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage));
      }
    });
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   * 
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   * 
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getActive(callback: CharacteristicGetCallback): void {
    this.platform.log.debug('Getting power state from TV');

    const command = 'POWR????\r';
    this.serial.send(command, (data: string) => {
      if (data.includes('1') || data.includes('0') && !data.includes('000')) {
        const value = data.includes('1') ? true : false;

        this.platform.log.debug('Get Characteristic Active ->', value);
  
        // the first argument of the callback should be null if there are no errors
        // the second argument contains the current status of the device to return.
        callback(null, value);
      } else {
        const errorMessage = `While attempting to get the power state, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage), false);
      }
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setActiveIdentifier(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ): void {
    const thisInput = this.accessory.context.device.inputs[value as number];

    const command = `IAVD${thisInput.id}   \r`;

    this.serial.send(command, (data: string) => {
      if (data) {
        this.platform.log.debug(
          'Set Characteristic Active Identifier -> ',
          value,
        );

        this.states.ActiveIdentifier = value as number;

        // the first argument of the callback should be null if there are no errors
        callback(null);
      } else {
        const errorMessage = `While attempting to set the input, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage));
      }
    });
  }

  /**
   * Handle "GET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  getActiveIdentifier(
    callback: CharacteristicSetCallback,
  ): void {
    this.platform.log.debug('Getting input state from TV');

    const command = 'IAVD?   \r';
    this.serial.send(command, (data: string) => {
      if (data.includes('0001') || data.includes('0002') || data.includes('0003') || data.includes('0004') || data.includes('0005') || data.includes('0006') || data.includes('0007') || data.includes('0008')) {
        const id = parseInt(data);

        // Get the internal ID of the input with the ID that matches what the TV returned
        const value = this.accessory.context.device.inputs.findIndex((input: { id: number }) => input.id === id);

        this.platform.log.info('Get Characteristic ActiveIdentifier ->', value);
    
        // the first argument of the callback should be null if there are no errors
        // the second argument contains the current status of the device to return.
        callback(null, value);
      } else if (data.includes('ERR')) {
        // The TV is likely off, use cached state
        callback(null, this.states.ActiveIdentifier);
      } else {
        const errorMessage = `While attempting to get input state, serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage), 0);
      }
    });
  }
}
