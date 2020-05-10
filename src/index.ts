import type { API } from 'homebridge';
import { SharpSerial } from './accessory'; 

/**
 * This method registers the accessory with Homebridge
 */
export = (api: API) => {
  api.registerAccessory('SharpSerial', SharpSerial);
}
