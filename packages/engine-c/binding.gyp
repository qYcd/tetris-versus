{
  "targets": [
    {
      "target_name": "tetris_engine",
      "sources": [
        "src/tetris_engine.c",
        "binding/binding_napi.c"
      ],
      "include_dirs": [
        "include"
      ],
      "defines": [
        "NAPI_VERSION=8"
      ],
      "xcode_settings": {
        "MACOSX_DEPLOYMENT_TARGET": "11.0"
      }
    }
  ]
}
