# Windows has no ELF/Mach-O build RPATH: stage transitive DLLs next to each exe.
function(rostercore_stage_runtime_dlls target)
  if(WIN32)
    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND "${CMAKE_COMMAND}"
        "-DRUNTIME_DLLS=$<TARGET_RUNTIME_DLLS:${target}>"
        "-DDESTINATION=$<TARGET_FILE_DIR:${target}>"
        -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/StageRuntimeDlls.cmake"
      VERBATIM)
  endif()
endfunction()
