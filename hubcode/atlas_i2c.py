"""
atlas_i2c.py -- Clean Atlas Scientific EZO I2C driver.

Python 3 only. No Python 2 compat, no debug prints, no truncation.
The original AtlasI2C.py had a [0:4] slice that truncated pH readings >= 10.0.
This driver strips null bytes and converts the full response to float.
"""
import fcntl
import io
import time


class AtlasI2C:
    """Driver for Atlas Scientific EZO sensors over I2C."""

    LONG_TIMEOUT = 1.5    # seconds -- used for R (read) and CAL commands
    SHORT_TIMEOUT = 0.3   # seconds -- used for all other commands
    DEFAULT_BUS = 1       # I2C bus 1 on modern Raspberry Pi
    I2C_SLAVE = 0x0703    # ioctl request code to set I2C slave address

    def __init__(self, address, bus=None):
        """
        Open I2C file descriptors for reading and writing.

        Args:
            address: I2C address of the sensor (e.g. 99 for pH EZO).
            bus: I2C bus number (default 1).
        """
        self.address = address
        self.bus = bus or self.DEFAULT_BUS
        self._file_read = io.open(f"/dev/i2c-{self.bus}", "rb", buffering=0)
        self._file_write = io.open(f"/dev/i2c-{self.bus}", "wb", buffering=0)
        fcntl.ioctl(self._file_read, self.I2C_SLAVE, self.address)
        fcntl.ioctl(self._file_write, self.I2C_SLAVE, self.address)

    def query(self, command):
        """
        Write a command to the sensor, wait the correct timeout, return the float value.

        Args:
            command: Atlas EZO command string (e.g. "R" to take a reading).

        Returns:
            float: sensor reading with full precision.
        """
        self._file_write.write((command + "\x00").encode("latin-1"))
        if command.upper().startswith(("R", "CAL")):
            timeout = self.LONG_TIMEOUT
        else:
            timeout = self.SHORT_TIMEOUT
        time.sleep(timeout)
        return self.read_value()

    def read_value(self):
        """
        Read 31 bytes from the sensor and parse to float.

        The Atlas EZO I2C response format:
          Byte 0: status byte (1 = success, 2 = syntax error, 255 = no data)
          Bytes 1-30: ASCII chars with MSB set due to Raspberry Pi I2C glitch,
                      padded with null bytes.

        Returns:
            float: sensor reading with full precision (NO [0:4] truncation).

        Raises:
            ValueError: if the status byte indicates an error.
        """
        raw = self._file_read.read(31)
        status_byte = raw[0]
        if status_byte != 1:
            raise ValueError(f"Sensor error code: {status_byte}")
        # Strip MSB (Raspberry Pi I2C glitch) and filter null bytes
        chars = [chr(b & ~0x80) for b in raw[1:] if (b & ~0x80) != 0]
        value_str = "".join(chars).strip("\x00").strip()
        return float(value_str)

    def get_device_info(self):
        """
        Query sensor firmware/type info ("I" command).

        Returns:
            str: device info string (e.g. "?I,pH,2.10").
        """
        self._file_write.write(b"I\x00")
        time.sleep(self.SHORT_TIMEOUT)
        raw = self._file_read.read(31)
        chars = [chr(b & ~0x80) for b in raw[1:] if (b & ~0x80) != 0]
        return "".join(chars).strip("\x00").strip()

    @staticmethod
    def detect_devices(bus=1):
        """
        Scan the I2C bus and return a list of addresses that respond.

        Args:
            bus: I2C bus number to scan (default 1).

        Returns:
            list[int]: responding I2C addresses.
        """
        found = []
        for addr in range(0, 128):
            try:
                with open(f"/dev/i2c-{bus}", "rb", buffering=0) as f:
                    fcntl.ioctl(f, 0x0703, addr)
                    f.read(1)
                    found.append(addr)
            except OSError:
                pass
        return found

    def close(self):
        """Close the I2C file descriptors."""
        self._file_read.close()
        self._file_write.close()
