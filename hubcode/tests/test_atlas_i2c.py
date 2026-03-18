"""
Tests for atlas_i2c.AtlasI2C driver.

All I2C file operations are mocked -- no physical sensor required.
"""
import io
import struct
import sys
import unittest
from unittest.mock import MagicMock, patch, call

# Ensure hubcode directory is on path for direct import
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def make_atlas_response(value_str, status=1):
    """
    Build a 31-byte simulated Atlas EZO I2C response.
    Byte 0: status byte (1 = success).
    Bytes 1..N: each char of value_str with MSB set (Pi glitch).
    Remaining bytes: 0x00 padding.
    """
    data = bytes([status])
    for ch in value_str:
        data += bytes([ord(ch) | 0x80])
    data += b'\x00' * (31 - len(data))
    return data


class TestAtlasI2CReadValue(unittest.TestCase):

    def _make_sensor(self, response_bytes):
        """Return an AtlasI2C instance with mocked file descriptors."""
        from atlas_i2c import AtlasI2C

        mock_file_read = MagicMock()
        mock_file_read.read.return_value = response_bytes
        mock_file_write = MagicMock()

        with patch('io.open') as mock_open, \
             patch('fcntl.ioctl'):
            # First call returns file_read mock, second returns file_write mock
            mock_open.side_effect = [mock_file_read, mock_file_write]
            sensor = AtlasI2C(address=99)

        # Replace internal file handles with mocks directly after construction
        sensor._file_read = mock_file_read
        sensor._file_write = mock_file_write
        return sensor

    def test_read_value_no_truncation_7_432(self):
        """pH 7.432 must return 7.432, not 7.43 (4-char truncation bug)."""
        sensor = self._make_sensor(make_atlas_response("7.432"))
        result = sensor.read_value()
        self.assertAlmostEqual(result, 7.432, places=5)

    def test_read_value_no_truncation_10_02(self):
        """pH 10.02 must return 10.02, not 10.0 (4-char truncation for >= 10)."""
        sensor = self._make_sensor(make_atlas_response("10.02"))
        result = sensor.read_value()
        self.assertAlmostEqual(result, 10.02, places=5)

    def test_read_value_no_truncation_6_8(self):
        """pH 6.8 must return 6.8."""
        sensor = self._make_sensor(make_atlas_response("6.8"))
        result = sensor.read_value()
        self.assertAlmostEqual(result, 6.8, places=5)

    def test_read_value_no_truncation_12_345(self):
        """pH 12.345 must return 12.345 (5 chars -- would definitely be truncated)."""
        sensor = self._make_sensor(make_atlas_response("12.345"))
        result = sensor.read_value()
        self.assertAlmostEqual(result, 12.345, places=5)

    def test_read_value_error_code_raises_value_error(self):
        """Status byte != 1 must raise ValueError containing the error code."""
        sensor = self._make_sensor(make_atlas_response("", status=255))
        with self.assertRaises(ValueError) as ctx:
            sensor.read_value()
        self.assertIn("255", str(ctx.exception))

    def test_read_value_error_code_2_raises_value_error(self):
        """Status byte 2 (syntax error) must also raise ValueError."""
        sensor = self._make_sensor(make_atlas_response("", status=2))
        with self.assertRaises(ValueError) as ctx:
            sensor.read_value()
        self.assertIn("2", str(ctx.exception))

    def test_read_value_strips_null_bytes(self):
        """Null padding bytes in response must be stripped before float conversion."""
        # Manually craft a response: status 1, "7.25" with MSB set, then nulls
        data = bytes([0x01, 0xB7, 0xAE, 0xB2, 0xB5]) + b'\x00' * 26  # "7.25" w/ MSB
        sensor = self._make_sensor(data)
        result = sensor.read_value()
        self.assertAlmostEqual(result, 7.25, places=5)


class TestAtlasI2CDetectDevices(unittest.TestCase):

    def test_detect_devices_returns_responding_addresses(self):
        """detect_devices() must return a list of addresses that respond."""
        from atlas_i2c import AtlasI2C

        def side_effect(path, *args, **kwargs):
            mock_f = MagicMock()
            mock_f.__enter__ = MagicMock(return_value=mock_f)
            mock_f.__exit__ = MagicMock(return_value=False)
            return mock_f

        def ioctl_side_effect(f, cmd, addr):
            # Raise OSError for all addresses except 99
            if addr != 99:
                raise OSError("no device")

        with patch('builtins.open', side_effect=side_effect), \
             patch('fcntl.ioctl', side_effect=ioctl_side_effect):
            result = AtlasI2C.detect_devices(bus=1)

        self.assertIn(99, result)
        # Other addresses should NOT be in the result
        self.assertNotIn(0, result)
        self.assertNotIn(50, result)

    def test_detect_devices_returns_empty_when_no_devices(self):
        """detect_devices() returns empty list when nothing responds."""
        from atlas_i2c import AtlasI2C

        def side_effect(path, *args, **kwargs):
            mock_f = MagicMock()
            mock_f.__enter__ = MagicMock(return_value=mock_f)
            mock_f.__exit__ = MagicMock(return_value=False)
            return mock_f

        with patch('builtins.open', side_effect=side_effect), \
             patch('fcntl.ioctl', side_effect=OSError("no bus")):
            result = AtlasI2C.detect_devices(bus=1)

        self.assertEqual(result, [])


class TestAtlasI2CQuery(unittest.TestCase):

    def _make_sensor(self, response_bytes):
        from atlas_i2c import AtlasI2C

        mock_file_read = MagicMock()
        mock_file_read.read.return_value = response_bytes
        mock_file_write = MagicMock()

        with patch('io.open') as mock_open, \
             patch('fcntl.ioctl'):
            mock_open.side_effect = [mock_file_read, mock_file_write]
            sensor = AtlasI2C(address=99)

        sensor._file_read = mock_file_read
        sensor._file_write = mock_file_write
        return sensor

    def test_query_writes_command_with_null(self):
        """query('R') must write 'R\x00' to the I2C write file."""
        sensor = self._make_sensor(make_atlas_response("7.00"))

        with patch('time.sleep'):
            sensor.query("R")

        sensor._file_write.write.assert_called_once_with(b"R\x00")

    def test_query_uses_long_timeout_for_read(self):
        """query('R') must sleep LONG_TIMEOUT before reading."""
        from atlas_i2c import AtlasI2C
        sensor = self._make_sensor(make_atlas_response("7.00"))

        with patch('time.sleep') as mock_sleep:
            sensor.query("R")

        mock_sleep.assert_called_once_with(AtlasI2C.LONG_TIMEOUT)

    def test_query_uses_short_timeout_for_info(self):
        """query('T') (temperature command) must sleep SHORT_TIMEOUT."""
        from atlas_i2c import AtlasI2C
        # Use a numeric response since query() always calls read_value()
        sensor = self._make_sensor(make_atlas_response("7.00"))

        with patch('time.sleep') as mock_sleep:
            sensor.query("T")

        mock_sleep.assert_called_once_with(AtlasI2C.SHORT_TIMEOUT)

    def test_query_returns_float(self):
        """query('R') must return the float value."""
        sensor = self._make_sensor(make_atlas_response("7.432"))

        with patch('time.sleep'):
            result = sensor.query("R")

        self.assertAlmostEqual(result, 7.432, places=5)


if __name__ == "__main__":
    unittest.main()
