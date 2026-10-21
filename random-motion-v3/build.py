"""Build the self-contained V3 without Max; the DSP path stays native."""
from pathlib import Path
import json
import struct
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent))
from tools.build import collective

STEM="Random_Motion_16_V3_1"
SOURCES=["rm16_v3_mapping.js","rm16_v3_motion.js","rm16_v3_limits.js"]


def patch():
    boxes,lines=[],[]
    def box(key,cls="newobj",text=None,rect=(0,0,90,22),**attrs):
        b=dict(id=key,maxclass=cls,patching_rect=list(rect),**attrs)
        if text is not None:b["text"]=text
        boxes.append({"box":b});return key
    def wire(src,out,dst,inp=0):
        lines.append({"patchline":{"source":[src,out],"destination":[dst,inp]}})
    def visible(key,cls,text,rect,**attrs):
        return box(key,cls,text,rect,presentation=1,presentation_rect=list(rect),**attrs)
    def label(key,text,rect,**attrs):
        return visible(key,"comment",text,rect,numinlets=1,numoutlets=0,
                       fontsize=10,fontname="Arial",ignoreclick=1,
                       textcolor=[0.91,0.93,0.94,1],**attrs)

    box("engine",text="js rm16_v3_mapping.js",rect=(24,270,170,22),varname="engine",
        numinlets=1,numoutlets=2,outlettype=["",""],
        saved_object_attributes={"filename":"rm16_v3_mapping.js","autowatch":0})
    box("state",text="pattr motion_state @bindto engine @parameter_enable 1",
        rect=(24,225,350,22),varname="motion_state",numinlets=1,numoutlets=3,
        saved_object_attributes={"parameter_enable":1,"parameter_mappable":0},
        saved_attribute_attributes={"valueof":{"parameter_longname":"Motion State",
            "parameter_shortname":"State","parameter_type":3,"parameter_invisible":1,
            "parameter_initial_enable":0}})
    box("device",text="live.thisdevice",rect=(410,225,100,22),numinlets=1,numoutlets=3)
    for name,x in [("init",410),("active",520)]:
        box(name+"_defer",text="deferlow",rect=(x,265,70,22),numinlets=1,numoutlets=1)
    box("init_msg","message","init",(410,295,40,22),numinlets=2,numoutlets=1)
    box("active_msg",text="prepend active",rect=(520,295,95,22),numinlets=1,numoutlets=1)
    wire("device",0,"init_defer");wire("init_defer",0,"init_msg");wire("init_msg",0,"engine")
    wire("device",1,"active_defer");wire("active_defer",0,"active_msg");wire("active_msg",0,"engine")
    box("closing",text="freebang",rect=(410,615,70,22),numinlets=0,numoutlets=1)
    box("closing_msg","message","notifydeleted",(510,615,110,22),numinlets=2,numoutlets=1)
    wire("closing",0,"closing_msg");wire("closing_msg",0,"engine")
    # Cycling '74 factory mapping pattern: path output 1 reports context changes.
    box("self_path",text="live.path live_set view this_device",rect=(740,225,235,22),numinlets=1,numoutlets=3)
    box("self_identity",text="live.observer id",rect=(740,265,110,22),numinlets=2,numoutlets=2,
        saved_object_attributes={"_persistence":0})
    box("self_changed",text="prepend contextchanged",rect=(740,295,165,22),numinlets=1,numoutlets=1)
    wire("self_path",1,"self_identity",1);wire("self_identity",0,"self_changed");wire("self_changed",0,"engine")
    box("audio_in",text="plugin~",rect=(990,225,70,22),numinlets=2,numoutlets=2,outlettype=["signal","signal"])
    box("audio_out",text="plugout~",rect=(990,295,70,22),numinlets=2,numoutlets=2,outlettype=["signal","signal"])
    wire("audio_in",0,"audio_out",0);wire("audio_in",1,"audio_out",1)
    for name,y in [("value_route",350),("id_route",390)]:
        box(name,text="route "+" ".join(map(str,range(1,17))),rect=(24,y,320,22),numinlets=1,numoutlets=17)
    wire("engine",0,"value_route");wire("engine",1,"id_route")
    for n in range(1,17):
        box("remote"+str(n),text="live.remote~ @smoothing 0",rect=(24+(n-1)*145,440,135,22),
            numinlets=2,numoutlets=0,saved_object_attributes={"_persistence":0})
        wire("value_route",n-1,"remote"+str(n));wire("id_route",n-1,"remote"+str(n),1)

    visible("background","panel",None,(0,0,720,169),numinlets=1,numoutlets=0,
            background=1,bgcolor=[0.1,0.12,0.14,1],border=0,rounded=0,ignoreclick=1)
    label("title","RANDOM MOTION 16  /  V3.1",(8,3,340,18),fontface=1)
    label("auto","BEREIT",(575,3,135,18),varname="health")
    for bank in range(2):
        for key,text,x,w in [("target","Ziel",8,174),("map","Map / x",184,46),("lo","Min %",234,56),("hi","Max %",296,56)]:
            label("header_"+str(bank)+"_"+key,text,(bank*360+x,23,w,14))
    # Each canvas occupies only its two numeric columns. Native Map buttons and
    # labels never intersect a jsui, regardless of Max's drawing/click order.
    for bank in range(2):
        name="limits"+str(bank)
        visible(name,"jsui",None,(bank*360+234,40,118,112),numinlets=1,numoutlets=1,
                filename="rm16_v3_limits.js",varname=name,parameter_enable=0,border=0,
                bgcolor=[0.1,0.12,0.14,1],
                hint="Ziehen: ganze Prozentpunkte. Doppelklick: genaue Zahl eingeben, Enter bestaetigt.")
        wire(name,0,"engine")
    for n in range(1,17):
        bx=((n-1)//8)*360;y=40+((n-1)%8)*14;p="lane"+str(n)+"_"
        label(p+"name",str(n)+"  nicht zugeordnet",(bx+8,y,172,14),varname=p+"name")
        visible(p+"map","textbutton","Map",(bx+184,y,44,14),numinlets=1,numoutlets=3,
                mode=1,texton="...",varname=p+"map",parameter_enable=0,fontsize=10,fontname="Arial",
                bgcolor=[0.22,0.25,0.28,1],bgoncolor=[0.18,0.63,0.57,1],
                textcolor=[0.94,0.95,0.95,1],textoncolor=[0.05,0.1,0.1,1],
                usebgoncolor=1,rounded=2,spacing_x=2,spacing_y=0,
                hint="Map, dann Ziel anklicken: startet sofort. x loest die Zuordnung.")
        box(p+"map_msg",text="prepend map "+str(n),rect=(24+(n-1)*145,510,120,22),numinlets=1,numoutlets=1)
        wire(p+"map",0,p+"map_msg");wire(p+"map_msg",0,"engine")
    visible("bound_editor","flonum",None,(234,40,56,14),numinlets=1,numoutlets=2,
            minimum=0,maximum=100,varname="bound_editor",parameter_enable=0,format=6,
            numdecimalplaces=0,hidden=1,fontsize=10,fontname="Arial",
            bgcolor=[0.2,0.26,0.28,1],textcolor=[0.94,0.95,0.95,1])
    box("edited",text="prepend edited",rect=(24,580,100,22),numinlets=1,numoutlets=1)
    wire("bound_editor",0,"edited");wire("edited",0,"engine")
    label("status","Map klicken, Ziel waehlen. Min/Max: 0 bis 100% Reglerweg.",(8,153,704,14),varname="status")

    return {"patcher":{"fileversion":1,"appversion":{"major":8,"minor":5,"revision":8,"architecture":"x64","modernui":1},
        "classnamespace":"box","rect":[80,80,1220,700],"openinpresentation":1,"devicewidth":720.0,
        "default_fontsize":11.0,"default_fontname":"Arial",
        "description":"16 independent random streams. Native ramps. Map, Min, Max. V3.1 based on v4.1.",
        "boxes":boxes,"lines":lines,"parameters":{"state":["Motion State","State",0],"inherited_shortname":1},
        "dependency_cache":[{"name":name,"type":"TEXT","implicit":1} for name in SOURCES],"autosave":0}}


def build(destination=None):
    out=Path(destination) if destination is not None else ROOT/"dist"
    out.mkdir(parents=True,exist_ok=True)
    raw=(json.dumps(patch(),ensure_ascii=False,indent=2)+"\n").encode()
    resources=[(STEM+".amxd",b"JSON",raw)]
    for name in SOURCES:
        data=(ROOT/"src"/name).read_bytes();(out/name).write_bytes(data)
        resources.append((name,b"TEXT",data))
    archive=collective(resources)
    prefix=b"ampf"+struct.pack("<I",4)+b"aaaa"+b"meta"+struct.pack("<II",4,7)
    (out/(STEM+".amxd")).write_bytes(prefix+b"ptch"+struct.pack("<I",len(archive))+archive)
    (out/(STEM+".maxpat")).write_bytes(raw)
    source_prefix=b"ampf"+struct.pack("<I",4)+b"aaaa"+b"meta"+struct.pack("<II",4,0)
    (out/(STEM+"_Source.amxd")).write_bytes(source_prefix+b"ptch"+struct.pack("<I",len(raw)+1)+raw+b"\0")
    return out/(STEM+".amxd")


if __name__=="__main__":
    device=build();print(str(device)+" ("+str(device.stat().st_size)+" bytes)")
