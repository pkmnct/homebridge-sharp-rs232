import SerialPort from 'serialport';

export class SerialProtocol {
    private readonly port: SerialPort;
    private readonly parser: SerialPort.parsers.Readline;

    private readonly queue: { command: string; callback: Function}[];
    private busy: boolean;
    private current: { command: string; callback: Function} | null;

    public send: Function;
    private processQueue: () => void;

    constructor(
        private readonly path: string,
        private readonly logger: { info: Function; error: Function; debug: Function },
    ) {

      // Initialize Serial Port
      this.port = new SerialPort(path, {
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        rtscts: false,
      }, (error: Error | null | undefined) => {
        if (error) {
          logger.error(error.message);
        } else {
          logger.info(`Initialized serial port at ${this.path}`);
        }
      });

      // Initialize Parser
      this.parser = this.port.pipe(new SerialPort.parsers.Readline({
        delimiter: '\r',
      }));

      // Initialize other variables
      this.busy = false;
      this.queue = [];
      this.current = null;
      
      this.parser.on('data', (data: string) => {
        // If we aren't expecting data, ignore it
        if (!this.current) {
          return;
        }

        logger.info('Got Data ' + data);
        this.current.callback(data);
        this.current = null;
        this.processQueue();
      });

      this.send = (command: string, callback: Function) => {
        // Push the command on the queue
        this.queue.push({command, callback});

        // If we are processing another command, return
        if (this.busy) {
          return;
        }

        // We are now processing a command
        this.busy = true;
        this.processQueue();
      };

      this.processQueue = () => {
        logger.info('Processing queue');
        // Get the command from the queue
        const next = this.queue.shift();

        if (!next) {
          this.busy = false;
        } else {
          this.current = next;
          logger.info('Sending command ' + next.command);
          this.port.write(next.command);
        }
      };
    }    
}