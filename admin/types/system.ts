import { Systeminformation } from "systeminformation"


export type SystemInformationResponse = {
    cpu: Systeminformation.CpuData
    mem: Systeminformation.MemData
    os: Systeminformation.OsData
    disk: Systeminformation.DiskLayoutData[]
}