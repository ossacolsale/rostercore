# A quoted -D list preserves paths with spaces. Empty lists support static builds.
foreach(runtime_dll IN LISTS RUNTIME_DLLS)
  get_filename_component(filename "${runtime_dll}" NAME)
  file(COPY_FILE "${runtime_dll}" "${DESTINATION}/${filename}" ONLY_IF_DIFFERENT)
endforeach()
