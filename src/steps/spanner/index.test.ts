import {
  createMockStepExecutionContext,
  Recording,
} from '@jupiterone/integration-sdk-testing';
import {
  fetchSpannerInstanceConfigs,
  fetchSpannerInstanceDatabases,
  fetchSpannerInstances,
} from '.';
import { integrationConfig } from '../../../test/config';
import { setupGoogleCloudRecording } from '../../../test/recording';
import { IntegrationConfig } from '../../types';
import { fetchKmsCryptoKeys, fetchKmsKeyRings } from '../kms';
import {
  ENTITY_TYPE_SPANNER_INSTANCE,
  ENTITY_TYPE_SPANNER_INSTANCE_CONFIG,
  ENTITY_TYPE_SPANNER_INSTANCE_DATABASE,
  RELATIONSHIP_TYPE_SPANNER_INSTANCE_USES_CONFIG,
  RELATIONSHIP_TYPE_SPANNER_INSTANCE_HAS_DATABASE,
  RELATIONSHIP_TYPE_SPANNER_INSTANCE_DATABASE_USES_KMS_KEY,
} from './constants';

jest.setTimeout(50000);

describe('#fetchSpannerInstanceConfigs', () => {
  let recording: Recording;

  beforeEach(() => {
    recording = setupGoogleCloudRecording({
      directory: __dirname,
      name: 'fetchSpannerInstanceConfigs',
    });
  });

  afterEach(async () => {
    await recording.stop();
  });

  test('should collect data', async () => {
    const context = createMockStepExecutionContext<IntegrationConfig>({
      instanceConfig: integrationConfig,
    });

    await fetchSpannerInstanceConfigs(context);

    expect({
      numCollectedEntities: context.jobState.collectedEntities.length,
      numCollectedRelationships: context.jobState.collectedRelationships.length,
      collectedEntities: context.jobState.collectedEntities,
      collectedRelationships: context.jobState.collectedRelationships,
      encounteredTypes: context.jobState.encounteredTypes,
    }).toMatchSnapshot();

    expect(
      context.jobState.collectedEntities.filter(
        (e) => e._type === ENTITY_TYPE_SPANNER_INSTANCE_CONFIG,
      ),
    ).toMatchGraphObjectSchema({
      _class: 'Configuration',
      schema: {
        additionalProperties: false,
        properties: {
          _type: { const: 'google_spanner_instance_config' },
          _rawData: {
            type: 'array',
            items: { type: 'object' },
          },
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
    });
  });
});

describe('#fetchSpannerInstances', () => {
  let recording: Recording;

  beforeEach(() => {
    recording = setupGoogleCloudRecording({
      directory: __dirname,
      name: 'fetchSpannerInstances',
    });
  });

  afterEach(async () => {
    await recording.stop();
  });

  test('should collect data', async () => {
    const context = createMockStepExecutionContext<IntegrationConfig>({
      instanceConfig: integrationConfig,
    });

    await fetchSpannerInstanceConfigs(context);
    await fetchSpannerInstances(context);

    expect({
      numCollectedEntities: context.jobState.collectedEntities.length,
      numCollectedRelationships: context.jobState.collectedRelationships.length,
      collectedEntities: context.jobState.collectedEntities,
      collectedRelationships: context.jobState.collectedRelationships,
      encounteredTypes: context.jobState.encounteredTypes,
    }).toMatchSnapshot();

    expect(
      context.jobState.collectedEntities.filter(
        (e) => e._type === ENTITY_TYPE_SPANNER_INSTANCE_CONFIG,
      ),
    ).toMatchGraphObjectSchema({
      _class: 'Configuration',
      schema: {
        additionalProperties: false,
        properties: {
          _type: { const: 'google_spanner_instance_config' },
          _rawData: {
            type: 'array',
            items: { type: 'object' },
          },
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
    });

    expect(
      context.jobState.collectedEntities.filter(
        (e) => e._type === ENTITY_TYPE_SPANNER_INSTANCE,
      ),
    ).toMatchGraphObjectSchema({
      _class: ['Database', 'Cluster'],
      schema: {
        additionalProperties: false,
        properties: {
          _type: { const: 'google_spanner_instance' },
          _rawData: {
            type: 'array',
            items: { type: 'object' },
          },
          name: { type: 'string' },
          displayName: { type: 'string' },
          nodeCount: { type: 'number' },
          state: { type: 'string' },
          public: { type: 'boolean' },
          webLink: { type: 'string' },
        },
      },
    });

    expect(
      context.jobState.collectedRelationships.filter(
        (e) => e._type === RELATIONSHIP_TYPE_SPANNER_INSTANCE_USES_CONFIG,
      ),
    ).toMatchDirectRelationshipSchema({
      schema: {
        properties: {
          _class: { const: 'USES' },
          _type: { const: 'google_spanner_instance_uses_config' },
        },
      },
    });
  });
});

describe('#fetchSpannerInstanceDatabases', () => {
  let recording: Recording;

  beforeEach(() => {
    recording = setupGoogleCloudRecording({
      directory: __dirname,
      name: 'fetchSpannerInstanceDatabases',
    });
  });

  afterEach(async () => {
    await recording.stop();
  });

  test('should collect data', async () => {
    const context = createMockStepExecutionContext<IntegrationConfig>({
      instanceConfig: integrationConfig,
    });

    await fetchKmsKeyRings(context);
    await fetchKmsCryptoKeys(context);
    await fetchSpannerInstances(context);
    await fetchSpannerInstanceDatabases(context);

    expect({
      numCollectedEntities: context.jobState.collectedEntities.length,
      numCollectedRelationships: context.jobState.collectedRelationships.length,
      collectedEntities: context.jobState.collectedEntities,
      collectedRelationships: context.jobState.collectedRelationships,
      encounteredTypes: context.jobState.encounteredTypes,
    }).toMatchSnapshot();

    expect(
      context.jobState.collectedEntities.filter(
        (e) => e._type === ENTITY_TYPE_SPANNER_INSTANCE,
      ),
    ).toMatchGraphObjectSchema({
      _class: ['Database', 'Cluster'],
      schema: {
        additionalProperties: false,
        properties: {
          _type: { const: 'google_spanner_instance' },
          _rawData: {
            type: 'array',
            items: { type: 'object' },
          },
          name: { type: 'string' },
          displayName: { type: 'string' },
          nodeCount: { type: 'number' },
          state: { type: 'string' },
          public: { type: 'boolean' },
          webLink: { type: 'string' },
        },
      },
    });

    expect(
      context.jobState.collectedEntities.filter(
        (e) => e._type === ENTITY_TYPE_SPANNER_INSTANCE_DATABASE,
      ),
    ).toMatchGraphObjectSchema({
      _class: 'Database',
      schema: {
        additionalProperties: false,
        properties: {
          _type: { const: 'google_spanner_database' },
          _rawData: {
            type: 'array',
            items: { type: 'object' },
          },
          name: { type: 'string' },
          displayName: { type: 'string' },
          state: { type: 'string' },
          versionRetentionPeriod: { type: 'string' },
          earliestVersionTime: { type: 'number' },
          public: { type: 'boolean' },
          'restoreInfo.sourceType': { type: 'string' },
          'restoreInfo.backup': { type: 'string' },
          'restoreInfo.versionTime': { type: 'number' },
          'restoreInfo.createTime': { type: 'number' },
          'restoreInfo.sourceDatabase': { type: 'string' },
          createdOn: { type: 'number' },
          webLink: { type: 'string' },
        },
      },
    });

    expect(
      context.jobState.collectedRelationships.filter(
        (e) => e._type === RELATIONSHIP_TYPE_SPANNER_INSTANCE_HAS_DATABASE,
      ),
    ).toMatchDirectRelationshipSchema({
      schema: {
        properties: {
          _class: { const: 'HAS' },
          _type: { const: 'google_spanner_instance_has_database' },
        },
      },
    });

    expect(
      context.jobState.collectedRelationships.filter(
        (e) =>
          e._type === RELATIONSHIP_TYPE_SPANNER_INSTANCE_DATABASE_USES_KMS_KEY,
      ),
    ).toMatchDirectRelationshipSchema({
      schema: {
        properties: {
          _class: { const: 'USES' },
          _type: { const: 'google_spanner_database_uses_kms_crypto_key' },
        },
      },
    });
  });
});
