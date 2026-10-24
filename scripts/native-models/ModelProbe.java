package gtnh.models;

import com.sun.tools.attach.VirtualMachine;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.io.PrintWriter;
import java.util.*;

public final class ModelProbe {
    static ClassLoader game;
    static Class<?> type(String name) throws Exception { return Class.forName(name, true, game); }
    static Object call(Object owner, String name, Object... args) throws Exception {
        for (Method m : owner.getClass().getMethods()) if (m.getName().equals(name) && m.getParameterCount() == args.length) {
            Class<?>[] params=m.getParameterTypes(); boolean matches=true;
            for(int i=0;i<params.length;i++) {
                Class<?> p=params[i]; Object a=args[i];
                if(p==boolean.class)p=Boolean.class; else if(p==byte.class)p=Byte.class; else if(p==int.class)p=Integer.class; else if(p==long.class)p=Long.class;
                if(a!=null&&!p.isInstance(a))matches=false;
            }
            if(!matches)continue;
            m.setAccessible(true);
            return m.invoke(owner, args);
        }
        throw new NoSuchMethodException(owner.getClass()+"."+name);
    }
    public static void main(String[] args) throws Exception {
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2]); } finally { vm.detach(); }
    }
    public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
        for (Class<?> t : instrumentation.getAllLoadedClasses()) if(t.getName().equals("net.minecraft.client.Minecraft")) game=t.getClassLoader();
        String[] parts=new String(Base64.getDecoder().decode(args),StandardCharsets.UTF_8).split("\\|",-1);
        Path output=Path.of(parts[0]); Files.createDirectories(output);
        Object client=type("net.minecraft.client.Minecraft").getMethod("func_71410_x").invoke(null);
        Runnable run=()->{
            try {
                Map<String,Object> result=new LinkedHashMap<>();
                Object[] machines=(Object[])type("gregtech.api.GregTechAPI").getField("METATILEENTITIES").get(null);
                for(String row:Files.readAllLines(Path.of(parts[1]),StandardCharsets.UTF_8)) {
                    int meta=Integer.parseInt(row); Object machine=machines[meta];
                    Map<String,Object> entry=new LinkedHashMap<>(); result.put(row,entry);
                    entry.put("class",machine.getClass().getName());
                    try {
                        Object definition=call(machine,"getStructureDefinition");
                        entry.put("shapes",call(definition,"getShapes"));
                        entry.put("elements",inspect(call(definition,"getElements"),7,new IdentityHashMap<>()));
                    } catch(Exception e) { entry.put("structureError",e.toString()); }
                    List<Object> faces=new ArrayList<>();
                    List<Object> layers=new ArrayList<>();
                    Object base=call(machine,"getBaseMetaTileEntity");
                    Object front=type("net.minecraftforge.common.util.ForgeDirection").getField("SOUTH").get(null);
                    for(boolean active:new boolean[]{false,true}) for(String name:new String[]{"EAST","WEST","UP","DOWN","SOUTH","NORTH"}) {
                        Object side=type("net.minecraftforge.common.util.ForgeDirection").getField(name).get(null);
                        try {
                            Object textures=call(machine,"getTexture",base,side,front,-1,active,false);
                            faces.add(inspect(textures,7,new IdentityHashMap<>()));
                            layers.add(textureLayers(textures,((Enum<?>)side).ordinal()));
                        }
                        catch(Exception e) { faces.add(e.toString()+" "+(e.getCause()==null?"":e.getCause())); }
                    }
                    entry.put("textures",faces);
                    entry.put("faces",layers);
                    List<String> methods=new ArrayList<>();for(Method method:machine.getClass().getMethods())if(method.getName().equals("getTexture")) methods.add(method.toString());entry.put("textureMethods",methods);
                    for(Class<?> c=machine.getClass();c!=null;c=c.getSuperclass()) for(Field f:c.getDeclaredFields()) {
                        if(f.getType()==String[][].class) { f.setAccessible(true);entry.put("shapeField:"+f.getName(),f.get(machine)); }
                    }
                }
                Map<String,Object> blocks=new LinkedHashMap<>(); result.put("blockFaces",blocks);
                Path requests=output.resolve("blocks.txt");
                if(Files.exists(requests)) for(String row:Files.readAllLines(requests,StandardCharsets.UTF_8)) {
                    String[] request=row.split("\\|");
                    Object registry=type("net.minecraft.block.Block").getField("field_149771_c").get(null);
                    Object block=call(registry,"func_82594_a",request[0]);
                    int meta=Integer.parseInt(request[1]);
                    List<Object> sides=new ArrayList<>();
                    for(int side:new int[]{5,4,1,0,3,2})sides.add(blockLayers(block,meta,side));
                    blocks.put(row,sides);
                }
                List<Object> hatches=new ArrayList<>();result.put("hatches",hatches);
                for(int meta=0;meta<machines.length;meta++)if(machines[meta]!=null) {
                    Object machine=machines[meta];
                    if(machine.getClass().getName().toLowerCase().contains("hatch")) {
                        Map<String,Object> item=new LinkedHashMap<>();item.put("meta",meta);item.put("class",machine.getClass().getName());
                        try{item.put("name",call(machine,"getLocalName"));}catch(Exception ignored){}
                        hatches.add(item);
                    }
                }
                Object gson=type("com.google.gson.GsonBuilder").getConstructor().newInstance();
                gson=call(gson,"setPrettyPrinting"); gson=call(gson,"create");
                Files.writeString(output.resolve("probe.json"),(String)call(gson,"toJson",result),StandardCharsets.UTF_8);
                Files.writeString(output.resolve("done.txt"),"ok");
            }catch(Throwable e){try(PrintWriter w=new PrintWriter(Files.newBufferedWriter(output.resolve("error.txt")))) {e.printStackTrace(w);}catch(Exception ignored){}}
        };
        call(client,"func_152344_a",run);
    }
    static Object field(Object value,String name) throws Exception {
        for(Class<?> c=value.getClass();c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(value);}catch(NoSuchFieldException ignored){}
        throw new NoSuchFieldException(name);
    }
    static List<Object> blockLayers(Object block,int meta,int side) throws Exception {
        if(type("bartworks.system.material.BWMetaGeneratedBlocks").isInstance(block)) {
            Object tile=call(block,"createTileEntity",null,meta);
            tile.getClass().getField("mMetaData").setShort(tile,(short)meta);
            Object direction=Array.get(type("net.minecraftforge.common.util.ForgeDirection").getEnumConstants(),side);
            return textureLayers(call(tile,"getTexture",block,direction),side);
        }
        Map<String,Object> layer=new LinkedHashMap<>();
        Object icon=call(block,"func_149691_a",side,meta);
        layer.put("icon",call(icon,"func_94215_i"));
        int color=(Integer)call(block,"func_149741_i",meta);
        layer.put("color",new int[]{color>>16&255,color>>8&255,color&255});
        return new ArrayList<>(List.of(layer));
    }
    static List<Object> textureLayers(Object value,int side) throws Exception {
        List<Object> result=new ArrayList<>();
        if(value.getClass().isArray()) {for(int i=0;i<Array.getLength(value);i++)result.addAll(textureLayers(Array.get(value,i),side));return result;}
        String name=value.getClass().getSimpleName();
        if(name.equals("GTSidedTextureRender"))return textureLayers(Array.get(field(value,"mTextures"),side),side);
        if(name.equals("GTMultiTextureRender"))return textureLayers(field(value,"mTextures"),side);
        if(name.equals("GTCopiedBlockTextureRender")) {
            int requested=((Number)field(value,"mSide")).intValue();
            return blockLayers(field(value,"mBlock"),((Number)field(value,"mMeta")).intValue(),requested==6?side:requested);
        }
        Object container=field(value,"mIconContainer");
        Object icon=call(container,"getIcon");
        Map<String,Object> layer=new LinkedHashMap<>();layer.put("icon",call(icon,"func_94215_i"));
        layer.put("color",inspect(field(value,"mRGBa"),3,new IdentityHashMap<>()));
        try{layer.put("glow",field(value,"glow"));}catch(Exception ignored){}
        result.add(layer);
        Object overlay=call(container,"getOverlayIcon");
        if(overlay!=null)result.add(Map.of("icon",call(overlay,"func_94215_i"),"color",new int[]{255,255,255}));
        return result;
    }
    static Object inspect(Object value,int depth,IdentityHashMap<Object,Boolean> seen) throws Exception {
        if(value==null||value instanceof String||value instanceof Number||value instanceof Boolean) return value;
        if(value instanceof Character) return value.toString();
        if(depth<=0) return value.getClass().getName();
        if(value instanceof Map<?,?> map) {Map<String,Object> result=new LinkedHashMap<>(); for(var e:map.entrySet()) result.put(e.getKey().toString(),inspect(e.getValue(),depth-1,seen));return result;}
        if(value.getClass().isArray()) {List<Object> result=new ArrayList<>(); for(int i=0;i<Array.getLength(value);i++)result.add(inspect(Array.get(value,i),depth-1,seen));return result;}
        if(value instanceof Iterable<?> items) {List<Object> result=new ArrayList<>();for(Object item:items)result.add(inspect(item,depth-1,seen));return result;}
        Map<String,Object> result=new LinkedHashMap<>();result.put("class",value.getClass().getName());
        try {
            if((Boolean)call(value,"isNavigating")) {
                result.put("step",new Object[]{call(value,"getStepA"),call(value,"getStepB"),call(value,"getStepC")});
                result.put("reset",new Object[]{call(value,"resetA"),call(value,"resetB"),call(value,"resetC")});
            }
        }catch(Exception ignored){}
        
        try { result.put("icon",call(value,"func_94215_i"));return result;} catch(Exception ignored){}
        if(type("net.minecraft.block.Block").isInstance(value)) {
            Object registry=type("net.minecraft.block.Block").getField("field_149771_c").get(null);
            result.put("block",call(registry,"func_148750_c",value));return result;
        }
        try {Object icon=call(value,"getIcon");result.put("icon",icon==null?null:call(icon,"func_94215_i"));Object overlay=call(value,"getOverlayIcon");result.put("overlay",overlay==null?null:call(overlay,"func_94215_i"));return result;}catch(Exception ignored){}
        if(value instanceof Enum<?>) return value.toString();
        if(value.getClass().getName().equals("gregtech.api.enums.Materials")) {
            for(String name:new String[]{"mName","mRGBa","mMetaItemSubID"})result.put(name,inspect(value.getClass().getField(name).get(value),depth-1,seen));
            Object set=value.getClass().getField("mIconSet").get(value);
            Object[] textures=(Object[])set.getClass().getField("mTextures").get(set);
            Object prefix=type("gregtech.api.enums.OrePrefixes").getField("frameGt").get(null);
            int index=prefix.getClass().getField("mTextureIndex").getInt(prefix);
            result.put("frame",inspect(textures[index],depth-1,seen));return result;
        }
        if(seen.put(value,true)!=null) return result;
        for(Class<?> c=value.getClass();c!=null&&!c.getName().startsWith("java.");c=c.getSuperclass()) for(Field f:c.getDeclaredFields()) {
            if(Modifier.isStatic(f.getModifiers())||f.getName().equals("this$0"))continue;
            f.setAccessible(true);
            try {result.put(f.getName(),inspect(f.get(value),depth-1,seen));}catch(Exception e){result.put(f.getName(),e.toString());}
        }
        return result;
    }
}
