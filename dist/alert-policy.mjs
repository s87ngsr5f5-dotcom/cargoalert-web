// Deduplicate reminders; this does not change the ESP32's detection timing.
export class AlarmEpisode {
  constructor(){this.reset();}
  reset(){this.latched=false;this.healthySince=null;this.last=null;}
  observe(status,now){
    const gap=this.last!==null&&now-this.last>1500;this.last=now;
    if(gap)this.healthySince=null;
    const valid=status&&status.fault===0;
    if(valid&&status.state==='U'){this.reset();return false;}
    if(valid&&status.calibrated&&status.state==='N'&&status.angle!==null){
      if(this.healthySince===null)this.healthySince=now;
      if(now-this.healthySince>=3000)this.latched=false;
    }else this.healthySince=null;
    if(valid&&status.calibrated&&status.state==='A'&&status.angle!==null&&!this.latched){this.latched=true;return true;}
    return false;
  }
}
