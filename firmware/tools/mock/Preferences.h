#ifndef GUANTE_MOCK_PREFERENCES_H
#define GUANTE_MOCK_PREFERENCES_H

#include <stddef.h>

class Preferences {
 public:
  bool begin(const char *, bool) { return true; }
  size_t getBytesLength(const char *) { return 0u; }
  size_t getBytes(const char *, void *, size_t) { return 0u; }
  size_t putBytes(const char *, const void *, size_t length) { return length; }
};

#endif
