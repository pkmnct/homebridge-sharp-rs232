import type { API } from 'homebridge';
import { SharpRS232 } from './accessory'; 

/**
 * This method registers the accessory with Homebridge
 */
export = (api: API) => {
  api.registerAccessory('SharpRS232', SharpRS232);
}
