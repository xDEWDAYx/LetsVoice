import migrateLegacyUserData from './UserDataMigration';

/**
 * 副作用入口：ES import 会被提升，写在 main.ts 语句位置的调用其实晚于所有 import。
 * 把调用放进模块里、并让 main.ts 第一个 import 它，才能真正抢在
 * 任何 IPC / 服务模块读取 userData 之前完成搬迁。
 */
migrateLegacyUserData();
