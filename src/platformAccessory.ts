import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';
import SerialPort from 'serialport';

import { SharpSerial } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Television {
  private service: Service;

  private readonly port: SerialPort;
  private readonly parser: SerialPort.parsers.Readline;

  constructor(
    private readonly platform: SharpSerial,
    private readonly accessory: PlatformAccessory,
  ) {

    // Initialize Serial Port
    this.port = new SerialPort(accessory.context.device.path || '/dev/ttyUSB0', {
      baudRate: accessory.context.device.baudRate || 9600,
    }, (error: Error | null | undefined) => {
      if (error) {
        this.platform.log.error(error.message);
      }
    });

    // Initialize Parser
    this.parser = this.port.pipe(new SerialPort.parsers.Readline({
      delimiter: '\r',
    }));

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        accessory.context.device.manufacturer || 'Unknown',
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
    accessory.context.device.inputs.forEach(
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
  setActive(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const handleError = (error: Error | null | undefined) => {
      if (error) {
        this.platform.log.error(error.message);
        callback(error);
      }
    };

    this.parser.once('data', (data: string) => {
      this.platform.log.debug('Got data', data);

      if (data.includes('OK')) {
        this.platform.log.debug('Set Characteristic Active ->', value);

        // the first argument of the callback should be null if there are no errors
        callback(null);
      } else {
        const errorMessage = `Serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage));
      }
    });

    const command = value ? 'POWR1   \r' : 'POWR0   \r';
    this.port.write(command, handleError);
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
  getActive(callback: CharacteristicGetCallback) {
    const handleError = (error: Error | null | undefined) => {
      if (error) {
        this.platform.log.error(error.message);
        callback(error, false);
      }
    };

    this.parser.once('data', (data: string) => {
      this.platform.log.debug('Got data', data);

      if (data.includes('1') || data.includes('0')) {
        const value = data.includes('1') ? true : false;

        this.platform.log.debug('Get Characteristic Active ->', value);
  
        // the first argument of the callback should be null if there are no errors
        // the second argument contains the current status of the device to return.
        callback(null, value);
      } else {
        const errorMessage = `Serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback (new Error(errorMessage), false);
      }
    });

    this.port.write('POWR????\r', handleError);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setActiveIdentifier(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const thisInput = this.accessory.context.device.inputs[value as number];

    this.platform.log.debug(
      'Set Characteristic Active Identifier -> ',
      value,
    );

    // you must call the callback function
    callback(null);
  }

  /**
   * Handle "GET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  getActiveIdentifier(
    callback: CharacteristicSetCallback,
  ) {

    const value = 0;

    this.platform.log.debug(
      'Get Characteristic Active Identifier -> ',
      value,
    );

    // you must call the callback function
    callback(null, value);
  }
}
