import fs from 'fs';
import os from 'os';
import path from 'path';

const mockGetPath = jest.fn();

jest.mock('electron', () => ({
  app: { getPath: mockGetPath },
}));

// eslint-disable-next-line import/first
import migrateLegacyUserData from '../UserDataMigration';

describe('migrateLegacyUserData', () => {
  let appDataPath: string;
  let userDataPath: string;

  beforeEach(() => {
    appDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'speakspace-local-migration-'),
    );
    userDataPath = path.join(appDataPath, 'SpeakSpace Local');
    mockGetPath.mockImplementation((name: string) =>
      name === 'userData' ? userDataPath : appDataPath,
    );
  });

  afterEach(() => {
    mockGetPath.mockReset();
    fs.rmSync(appDataPath, { recursive: true, force: true });
  });

  it('从 SpeakSpace 目录迁移数据库、设置和模型激活状态', () => {
    const legacyPath = path.join(appDataPath, 'SpeakSpace');
    fs.mkdirSync(path.join(legacyPath, 'model-state'), { recursive: true });
    fs.writeFileSync(path.join(legacyPath, 'speakspace.db'), 'database');
    fs.writeFileSync(path.join(legacyPath, 'app-settings.json'), '{}');
    fs.writeFileSync(
      path.join(legacyPath, 'model-state', 'tts.json'),
      '{"activeModelId":"kokoro-multi-lang-v1_0"}',
    );

    migrateLegacyUserData();

    expect(
      fs.readFileSync(path.join(userDataPath, 'speakspace.db'), 'utf8'),
    ).toBe('database');
    expect(fs.existsSync(path.join(userDataPath, 'app-settings.json'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(userDataPath, 'model-state', 'tts.json')),
    ).toBe(true);
    const marker = JSON.parse(
      fs.readFileSync(path.join(userDataPath, '.userdata-migrated'), 'utf8'),
    );
    expect(marker.from).toBe(legacyPath);
    expect(marker.copied).toEqual(
      expect.arrayContaining([
        'speakspace.db',
        'app-settings.json',
        'model-state',
      ]),
    );
  });

  it('不覆盖新目录里已经存在的数据', () => {
    const legacyPath = path.join(appDataPath, 'SpeakSpace');
    fs.mkdirSync(legacyPath, { recursive: true });
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(legacyPath, 'speakspace.db'), 'old');
    fs.writeFileSync(path.join(userDataPath, 'speakspace.db'), 'new');

    migrateLegacyUserData();

    expect(
      fs.readFileSync(path.join(userDataPath, 'speakspace.db'), 'utf8'),
    ).toBe('new');
  });
});
