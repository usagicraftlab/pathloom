// Printer templates and legacy template migration; no UI or storage side effects.
export const defaultStartGcode=`G90 ; use absolute coordinates
M83 ; extruder relative mode
M140 S{bed_temperature} ; set bed temp
M104 S{nozzle_temperature} ; set extruder temp
M190 S{bed_temperature} ; wait for bed temp
M109 S{nozzle_temperature} ; wait for extruder temp
M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%`;
export const defaultEndGcode=`G1 Z{print_max_z_plus_10} F{travel_feedrate} ; move print head up
G1 X0 Y{bed_depth} F{travel_feedrate} ; park
M104 S0 ; turn off temperature
M140 S0 ; turn off heatbed
M107 ; turn off fan
M84 ; disable motors`;
export const defaultToolChangeGcode=`T{to_tool}`;
export const referenceToolChangeGcode=`; Prepare for tool change T{from_tool} -> T{to_tool}
G92 E0
G1 E-15.0000 F6000
G1 E12.0000 F600
G1 E-15.0000 F6000
G1 E8.0000 F600
G1 E-15.0000 F6000
G1 E-24.0000 F1200
G1 E-7 F600
G1 E-35.0000 F300
M142 S36 ; heatbreak temperature
T{to_tool}
M900 K0.05
M572 S0.036
G92 E0
G1 E6.4 F3000 ; after tool change load
G1 E{tool_change_load} F900 ; after tool change load`;
export const referenceStartGcode=`M555 X{print_min_x} Y{print_min_y} W{print_area_width} H{print_area_height}
G90 ; use absolute coordinates
M83 ; extruder relative mode
M104 S170 ; preheat extruder
M140 S{bed_temperature} ; set bed temp
M109 S170 ; wait for preheat
G28 W ; home all without mesh bed level
G0 Z40 F1000
G1 E-2 F2400 ; retraction
M84 E ; turn off E motor

; Nozzle wiper
G0 X210 Y-14 Z1.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-18 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z1.5 F3000
G29 P9 X208 Y-2.5 W32 H4

; Nozzle wiper after probing
G0 X210 Y-14 Z1.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X210 Y-14 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-14 Z0.5 F3000
G0 X210 Y-18 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X168 Y-16 Z0.5 F3000
G0 X210 Y-14 Z1.5 F3000

; Mesh bed leveling
M84 E
G29 P1
G29 P1 X150 Y0 W100 H20 C
G29 P3.2
G29 P3.13
G29 A

; Prepare and purge
M104 S{nozzle_temperature}
G0 X249 Y-2.5 Z15 F4800
M109 S{nozzle_temperature}
M190 S{bed_temperature}
T0
G1 E20 F1000
G92 E0
G0 E5 X235 Z0.2 F500
G0 X145 E36 F500
G0 X135 E4 F500
G0 X125 E4 F650
G0 X122 Z0.05 F8000
G0 X119 Z0.2 F8000
G92 E0
M221 S100
M907 E430
G21
G90
M83
M900 K0.05
M900 K30
M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%`;
export const referenceEndGcode=`G1 Z{print_max_z_plus_10} F{travel_feedrate} ; move print head up
G1 X0 Y{bed_depth} F{travel_feedrate} ; park
G1 E6 F2000
G1 E-35 F2000
M702 C ; unload filament
G4 ; wait
M221 S100 ; reset flow
M900 K0 ; reset LA
M907 E538 ; reset extruder motor current
M104 S0 ; turn off temperature
M140 S0 ; turn off heatbed
M107 ; turn off fan
M84 ; disable motors
M73 P100 R0
M73 Q100 S0`;
export function profileGcodeDefaults(name){return name==='Prusa MK4S'?{startGcode:referenceStartGcode,toolChangeGcode:referenceToolChangeGcode,endGcode:referenceEndGcode}:{startGcode:defaultStartGcode,toolChangeGcode:defaultToolChangeGcode,endGcode:defaultEndGcode}}
export function normalizeStoredGcode(code){return String(code||'').replace(/^M555 X63 Y42 W123 H125$/m,'M555 X{print_min_x} Y{print_min_y} W{print_area_width} H{print_area_height}').replace(/^M106 S125(?:\s*;.*)?$/m,'M106 S{fan_speed_255} ; set fan to {fan_speed_percent}%')}
