# Windows has no ELF/Mach-O build RPATH: stage transitive DLLs next to each exe.
function(rostercore_stage_runtime_dlls target)
  if(WIN32)
    get_filename_component(linker_directory "${CMAKE_LINKER}" DIRECTORY)
    find_program(ROSTERCORE_DUMPBIN NAMES dumpbin HINTS "${linker_directory}")
    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND "${CMAKE_COMMAND}"
        "-DRUNTIME_DLLS=$<TARGET_RUNTIME_DLLS:${target}>"
        "-DDESTINATION=$<TARGET_FILE_DIR:${target}>"
        "-DEXECUTABLE=$<TARGET_FILE:${target}>"
        "-DRUNTIME_ROOTS=${CMAKE_SOURCE_DIR}/.deps/ortools"
        "-DSEARCH_DIRECTORIES=${CMAKE_SOURCE_DIR}/.deps/ortools/bin;${CMAKE_SOURCE_DIR}/.deps/ortools/lib"
        "-DDUMPBIN=${ROSTERCORE_DUMPBIN}"
        -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/StageRuntimeDlls.cmake"
      VERBATIM)
  endif()
endfunction()
