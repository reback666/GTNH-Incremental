package gtnh.icons;

import com.sun.tools.attach.VirtualMachine;
import java.awt.Dimension;
import java.awt.image.BufferedImage;
import java.io.PrintWriter;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.imageio.ImageIO;

public final class InventoryIcons {
    private static ClassLoader game;

    public static void main(String[] args) throws Exception {
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try {
            vm.loadAgent(args[1], Base64.getEncoder().encodeToString(args[2].getBytes(StandardCharsets.UTF_8)));
        } finally {
            vm.detach();
        }
    }

    public static void agentmain(String argument, Instrumentation instrumentation) throws Exception {
        String[] args = new String(Base64.getDecoder().decode(argument), StandardCharsets.UTF_8).split("\\|", -1);
        Path output = Path.of(args[1]);
        Files.createDirectories(output);
        for (Class<?> type : instrumentation.getAllLoadedClasses()) {
            if (type.getName().equals("net.minecraft.client.Minecraft")) game = type.getClassLoader();
        }
        if (game == null) throw new IllegalStateException("Minecraft is not loaded yet");
        Class<?> minecraft = type("net.minecraft.client.Minecraft");
        Object client = minecraft.getMethod("func_71410_x").invoke(null);
        Runnable task = () -> {
            try {
                if (args[0].equals("catalog")) catalog(client, output);
                else if (args[0].equals("export")) export(client, output, Path.of(args[2]));
                else throw new IllegalArgumentException("Unknown action: " + args[0]);
                Files.writeString(output.resolve("done.txt"), args[0], StandardCharsets.UTF_8);
            } catch (Throwable error) {
                try (PrintWriter writer = new PrintWriter(Files.newBufferedWriter(output.resolve("error.txt")))) {
                    error.printStackTrace(writer);
                } catch (Exception ignored) { }
            }
        };
        minecraft.getMethod("func_152344_a", Runnable.class).invoke(client, task);
    }

    private static Class<?> type(String name) throws ClassNotFoundException {
        return Class.forName(name, true, game);
    }

    private static Field field(Class<?> owner, String name) throws Exception {
        Field result = owner.getDeclaredField(name);
        result.setAccessible(true);
        return result;
    }

    private static Object[] machines() throws Exception {
        return (Object[]) type("gregtech.api.GregTechAPI").getField("METATILEENTITIES").get(null);
    }

    private static Object registry() throws Exception {
        return type("net.minecraft.item.Item").getField("field_150901_e").get(null);
    }

    private static void catalog(Object client, Path output) throws Exception {
        List<String> rows = new ArrayList<>();
        rows.add("meta\tclass\tname");
        Object[] entries = machines();
        for (int id = 0; id < entries.length; id++) {
            Object machine = entries[id];
            if (machine == null) continue;
            Object stack = machine.getClass().getMethod("getStackForm", long.class).invoke(machine, 1L);
            String name = (String) stack.getClass().getMethod("func_82833_r").invoke(stack);
            rows.add(id + "\t" + machine.getClass().getName() + "\t" + name.replace('\t', ' '));
        }
        Files.write(output.resolve("machines.tsv"), rows, StandardCharsets.UTF_8);
        Object registry = registry();
        Method getItem = registry.getClass().getMethod("func_82594_a", Object.class);
        Class<?> itemType = type("net.minecraft.item.Item");
        Class<?> tabType = type("net.minecraft.creativetab.CreativeTabs");
        Method subItems = itemType.getMethod("func_150895_a", itemType, tabType, List.class);
        Method creativeTab = itemType.getMethod("func_77640_w");
        rows = new ArrayList<>();
        rows.add("registry\tmeta\tname");
        for (Object key : (Iterable<?>) registry.getClass().getMethod("func_148742_b").invoke(registry)) {
            if (!key.toString().toLowerCase().matches(".*(thaum|automagy|witchery).*")) continue;
            Object item = getItem.invoke(registry, key);
            ArrayList<Object> variants = new ArrayList<>();
            subItems.invoke(item, item, creativeTab.invoke(item), variants);
            for (Object stack : variants) {
                Object meta = stack.getClass().getMethod("func_77960_j").invoke(stack);
                Object name = stack.getClass().getMethod("func_82833_r").invoke(stack);
                rows.add(key + "\t" + meta + "\t" + name.toString().replace('\t', ' '));
            }
        }
        Files.write(output.resolve("items.tsv"), rows, StandardCharsets.UTF_8);
        Object settings = client.getClass().getField("field_71474_y").get(client);
        Object packs = settings.getClass().getField("field_151453_l").get(settings);
        Files.writeString(output.resolve("resource-packs.txt"), packs.toString(), StandardCharsets.UTF_8);
    }

    private static void gl(String name, Class<?>[] signature, Object... arguments) throws Exception {
        type("org.lwjgl.opengl.GL11").getMethod(name, signature).invoke(null, arguments);
    }

    private static void export(Object client, Path output, Path selection) throws Exception {
        List<String> rows = Files.readAllLines(selection, StandardCharsets.UTF_8);
        ArrayList<Object> stacks = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        Object registry = registry();
        Method getItem = registry.getClass().getMethod("func_82594_a", Object.class);
        Class<?> itemType = type("net.minecraft.item.Item");
        for (String row : rows) {
            if (row.isBlank() || row.startsWith("#")) continue;
            String[] columns = row.split("\t");
            Object item = getItem.invoke(registry, columns[1]);
            if (item == null) throw new IllegalArgumentException("Missing item: " + row);
            stacks.add(type("net.minecraft.item.ItemStack").getConstructor(itemType, int.class, int.class)
                .newInstance(item, 1, Integer.parseInt(columns[2])));
            keys.add(columns[0]);
        }

        Object panel = type("codechicken.nei.ItemPanels").getField("itemPanel").get(null);
        Object grid = panel.getClass().getMethod("getGrid").invoke(panel);
        Field realItems = field(type("codechicken.nei.ItemsGrid"), "realItems");
        Object previousItems = realItems.get(grid);
        // NEI owns both the inventory rendering and framebuffer readback; no face synthesis occurs here.
        Path dump = ((java.io.File) client.getClass().getField("field_71412_D").get(client)).toPath()
            .resolve("dumps/itempanel_icons");
        if (Files.isDirectory(dump)) {
            try (var files = Files.list(dump)) {
                if (files.findAny().isPresent()) throw new IllegalStateException("Preserve existing NEI dump before exporting");
            }
        }
        Class<?> dumperClass = type("codechicken.nei.config.GuiItemIconDumper");
        Object dumper = dumperClass.getConstructor(type("codechicken.nei.config.Option"), int.class)
            .newInstance(null, 64);
        Method draw = dumperClass.getDeclaredMethod("drawItems");
        Method screenshot = dumperClass.getDeclaredMethod("screenshot");
        draw.setAccessible(true);
        screenshot.setAccessible(true);
        Field drawIndex = field(dumperClass, "drawIndex");
        Object framebuffer = client.getClass().getMethod("func_147110_a").invoke(client);
        framebuffer.getClass().getMethod("func_147610_a", boolean.class).invoke(framebuffer, true);
        gl("glPushAttrib", new Class<?>[]{int.class}, 0xFFFFF);
        gl("glMatrixMode", new Class<?>[]{int.class}, 5889);
        gl("glPushMatrix", new Class<?>[]{});
        gl("glMatrixMode", new Class<?>[]{int.class}, 5888);
        gl("glPushMatrix", new Class<?>[]{});
        try {
            Object renderer = client.getClass().getField("field_71460_t").get(client);
            renderer.getClass().getMethod("func_78478_c").invoke(renderer);
            realItems.set(grid, stacks);
            Dimension size = (Dimension) type("codechicken.lib.gui.GuiDraw").getMethod("displayRes").invoke(null);
            int columns = size.width / 72;
            int capacity = columns * (size.height / 72);
            if (capacity < 1) throw new IllegalStateException("Game window is too small");
            while (drawIndex.getInt(dumper) < stacks.size()) {
                int first = drawIndex.getInt(dumper);
                draw.invoke(dumper);
                BufferedImage pixels = (BufferedImage) screenshot.invoke(dumper);
                int last = drawIndex.getInt(dumper);
                for (int index = first; index < last; index++) {
                    int slot = index - first;
                    BufferedImage icon = pixels.getSubimage(slot % columns * 72 + 4, slot / columns * 72 + 4, 64, 64);
                    ImageIO.write(icon, "png", output.resolve(keys.get(index) + ".png").toFile());
                }
            }
        } finally {
            realItems.set(grid, previousItems);
            gl("glMatrixMode", new Class<?>[]{int.class}, 5888);
            gl("glPopMatrix", new Class<?>[]{});
            gl("glMatrixMode", new Class<?>[]{int.class}, 5889);
            gl("glPopMatrix", new Class<?>[]{});
            gl("glPopAttrib", new Class<?>[]{});
            framebuffer.getClass().getMethod("func_147609_e").invoke(framebuffer);
            Files.deleteIfExists(dump);
        }
    }
}
