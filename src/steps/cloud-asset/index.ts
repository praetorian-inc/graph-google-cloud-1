import {
  createDirectRelationship,
  createMappedRelationship,
  generateRelationshipType,
  getRawData,
  IntegrationStep,
  Relationship,
  RelationshipClass,
  RelationshipDirection,
} from '@jupiterone/integration-sdk-core';
import { cloudresourcemanager_v3 } from 'googleapis';
import { IntegrationConfig } from '../..';
import { IntegrationStepContext } from '../../types';
import { publishMissingPermissionEvent } from '../../utils/events';
import { getProjectIdFromName } from '../../utils/jobState';
import { IAM_ROLE_ENTITY_CLASS, IAM_ROLE_ENTITY_TYPE } from '../iam';
import {
  buildIamTargetRelationship,
  findOrCreateIamRoleEntity,
  getPermissionsForManagedRole,
  maybeFindIamUserEntityWithParsedMember,
} from '../resource-manager';
import { CloudAssetClient } from './client';
import {
  bindingEntities,
  BINDING_ALLOWS_ANY_RESOURCE_RELATIONSHIP,
  BINDING_ASSIGNED_PRINCIPAL_RELATIONSHIPS,
  STEP_CREATE_BASIC_ROLES,
  STEP_CREATE_BINDING_ANY_RESOURCE_RELATIONSHIPS,
  STEP_CREATE_BINDING_PRINCIPAL_RELATIONSHIPS,
  STEP_CREATE_BINDING_ROLE_RELATIONSHIPS,
  STEP_IAM_BINDINGS,
} from './constants';
import {
  BindingEntity,
  buildIamBindingEntityKey,
  createIamBindingEntity,
} from './converters';
import {
  getTypeAndKeyFromResourceIdentifier,
  makeLogsForTypeAndKeyResponse,
} from '../../utils/iamBindings/getTypeAndKeyFromResourceIdentifier';
import { getEnabledServiceNames } from '../enablement';
import { MULTIPLE_J1_TYPES_FOR_RESOURCE_KIND } from '../../utils/iamBindings/resourceKindToTypeMap';
import { createIamRoleEntity } from '../iam/converters';
import { basicRoles, BasicRoleType } from '../../utils/iam';

export async function fetchIamBindings(
  context: IntegrationStepContext,
): Promise<void> {
  const { jobState, instance, logger } = context;
  const client = new CloudAssetClient({ config: instance.config });
  let iamBindingsCount = 0;

  const bindingGraphKeySet = new Set<string>();
  const duplicateBindingGraphKeys: string[] = [];

  try {
    await client.iterateAllIamPolicies(context, async (policyResult) => {
      const resource = policyResult.resource;
      const projectName = policyResult.project as string | undefined;
      const bindings = policyResult.policy?.bindings ?? [];

      for (const binding of bindings) {
        const _key = buildIamBindingEntityKey({
          binding,
          projectName,
          resource,
        });

        if (bindingGraphKeySet.has(_key)) {
          duplicateBindingGraphKeys.push(_key);
          continue;
        }

        let projectId: string | undefined;
        if (projectName) {
          /**
           * We can not pull the projectId from the resource identifier because the resource
           * identifier does not gaurentee a projectId value.
           *
           * See https://cloud.google.com/asset-inventory/docs/resource-name-format and search
           * for cloudresourcemanager.googleapis.com/Project to see that the identifier could
           * either be for PROJECT_NUMBER or PROJECT_ID
           *
           * Because of this we have to pull the projectId from the jobState instead.
           */
          projectId = await getProjectIdFromName(jobState, projectName);
        }

        /**
         * We need to denormalize the permissions onto the role binding because J1QL does not support
         * baranching traversals, meaning that it is impossible to connect a resource, to a principle
         * to a role with a specific permission. Having the role's permissions on the binding prevents
         * any branching.
         */
        const roleEntity =
          binding.role && (await jobState.findEntity(binding.role));
        const permissions = binding.role
          ? roleEntity
            ? ((roleEntity.permissions as string) || '').split(',')
            : await getPermissionsForManagedRole(jobState, binding.role)
          : [];

        await jobState.addEntity(
          createIamBindingEntity({
            _key,
            projectId,
            projectName,
            binding,
            resource,
            permissions,
          }),
        );

        bindingGraphKeySet.add(_key);
        iamBindingsCount++;
      }
    });
  } catch (err) {
    if (err.status === 403) {
      logger.info(
        {
          err,
        },
        'Error iterating all IAM policies',
      );

      publishMissingPermissionEvent({
        logger,
        permission: 'cloudasset.assets.searchAllIamPolicies',
        stepId: STEP_IAM_BINDINGS,
      });

      return;
    }

    throw err;
  }

  logger.info(
    { numIamBindings: iamBindingsCount },
    'Created IAM binding entities',
  );

  if (duplicateBindingGraphKeys.length) {
    logger.info(
      { duplicateBindingGraphKeys },
      'Found duplicate IAM binding graph keys',
    );
  }
}

/**
 * Basic Roles roles exist at all levels of the organization resource hierarchy.
 * They are: roles/owner, roles/editor, roles/viewer and roles/browser
 *   https://cloud.google.com/iam/docs/understanding-roles#basic
 *
 * In order to make full access analysis possible, we need to create IAM Roles
 * for each Basic Role that is bond to a Project, Folder, or Organization via a
 * Role Binding.
 */
export async function createBasicRolesForBindings(
  context: IntegrationStepContext,
): Promise<void> {
  const { jobState, logger } = context;
  await jobState.iterateEntities(
    { _type: bindingEntities.BINDINGS._type },
    async (bindingEntity: BindingEntity) => {
      if (bindingEntity.role) {
        // Need to handle Basic Roles different than others as we need to add identifiers for what that basic role is attached to.
        // For example: roles/editor can be attached at either an Organization, Folder, or Project which will have a key of projects/12345/roles/editor.
        if (basicRoles.includes(bindingEntity.role as BasicRoleType)) {
          const { key } =
            makeLogsForTypeAndKeyResponse(
              logger,
              await getTypeAndKeyFromResourceIdentifier(
                bindingEntity.resource,
                context,
              ),
            ) ?? {};
          await findOrCreateIamRoleEntity({
            jobState,
            roleName: bindingEntity.role,
            roleKey: key + '/' + bindingEntity.role,
          });
        }
      }
    },
  );
}

export async function createBindingRoleRelationships(
  context: IntegrationStepContext,
): Promise<void> {
  const { jobState, logger } = context;
  await jobState.iterateEntities(
    { _type: bindingEntities.BINDINGS._type },
    async (bindingEntity: BindingEntity) => {
      if (bindingEntity.role) {
        let roleKey: string = bindingEntity.role;
        // Need to handle Basic Roles different than others as we need to add identifiers for what that basic role is attached to.
        // For example: roles/editor can be attached at either an Organization, Folder, or Project which will have a key of projects/12345/roles/editor.
        if (basicRoles.includes(bindingEntity.role as BasicRoleType)) {
          const { key } =
            makeLogsForTypeAndKeyResponse(
              logger,
              await getTypeAndKeyFromResourceIdentifier(
                bindingEntity.resource,
                context,
              ),
            ) ?? {};
          roleKey = key + '/' + bindingEntity.role;
        }

        const roleEntity = await jobState.findEntity(roleKey);
        if (roleEntity) {
          await jobState.addRelationship(
            createDirectRelationship({
              _class: RelationshipClass.USES,
              from: bindingEntity,
              to: roleEntity,
            }),
          );
        } else {
          const includedPermissions = await getPermissionsForManagedRole(
            jobState,
            bindingEntity.role,
          );
          const targetRoleEntitiy = createIamRoleEntity(
            {
              name: bindingEntity.role,
              title: bindingEntity.role,
              includedPermissions,
            },
            {
              custom: false,
            },
          );
          await jobState.addRelationship(
            createMappedRelationship({
              _class: RelationshipClass.USES,
              _type: generateRelationshipType(
                RelationshipClass.USES,
                bindingEntities.BINDINGS._type,
                IAM_ROLE_ENTITY_TYPE,
              ),
              _mapping: {
                relationshipDirection: RelationshipDirection.FORWARD,
                sourceEntityKey: bindingEntity._key,
                targetFilterKeys: [['_type', '_key']],
                /**
                 * The mapper does properly remove mapper-created entities at the moment. These
                 * entities will never be cleaned up which will cause duplicates.
                 *
                 * However, we should still create these entities as they are important for access
                 * analysis and having duplicates shouldn't matter too much with IAM roles.
                 */
                skipTargetCreation: false,
                targetEntity: {
                  ...targetRoleEntitiy,
                  _rawData: undefined,
                },
              },
            }),
          );
        }
      }
    },
  );
}

export async function createPrincipalRelationships(
  context: IntegrationStepContext,
): Promise<void> {
  const { jobState, logger } = context;
  const memberRelationshipKeys = new Set<string>();

  async function safeAddRelationship(relationship?: Relationship) {
    if (relationship && !memberRelationshipKeys.has(relationship._key)) {
      await jobState.addRelationship(relationship);
      memberRelationshipKeys.add(String(relationship._key));
    }
  }

  await jobState.iterateEntities(
    { _type: bindingEntities.BINDINGS._type },
    async (bindingEntity: BindingEntity) => {
      const condition: cloudresourcemanager_v3.Schema$Expr | undefined =
        getRawData<cloudresourcemanager_v3.Schema$Binding>(
          bindingEntity,
        )?.condition;
      if (!bindingEntity.role) {
        logger.warn(
          { binding: bindingEntity },
          'Binding does not have an associated role.',
        );
      }

      for (const member of bindingEntity?.members ?? []) {
        const iamUserEntityWithParsedMember =
          await maybeFindIamUserEntityWithParsedMember({
            context,
            member,
          });

        await safeAddRelationship(
          buildIamTargetRelationship({
            iamEntity: bindingEntity,
            projectId: bindingEntity.projectId,
            iamUserEntityWithParsedMember,
            condition,
            relationshipDirection: RelationshipDirection.FORWARD,
          }),
        );
      }
    },
  );
}

function getServiceFromResourceIdentifier(googleResourceIdentifier: string) {
  const [_, __, service, ..._rest] = googleResourceIdentifier.split('/');
  return service;
}

export async function createBindingToAnyResourceRelationships(
  context: IntegrationStepContext,
): Promise<void> {
  const { jobState, instance, logger } = context;
  const enabledServiceNames = await getEnabledServiceNames(instance.config);
  await jobState.iterateEntities(
    { _type: bindingEntities.BINDINGS._type },
    async (bindingEntity: BindingEntity) => {
      const { type, key } =
        makeLogsForTypeAndKeyResponse(
          logger,
          await getTypeAndKeyFromResourceIdentifier(
            bindingEntity.resource,
            context,
          ),
        ) ?? {};
      if (typeof type !== 'string' || typeof key !== 'string') {
        return;
      }
      // Check to see if service is enabled prior to searching the jobState for an entity
      const service = getServiceFromResourceIdentifier(bindingEntity.resource);
      const existingEntity = enabledServiceNames.includes(service)
        ? await jobState.findEntity(key)
        : undefined;
      await jobState.addRelationship(
        existingEntity
          ? createDirectRelationship({
              from: bindingEntity,
              _class: RelationshipClass.ALLOWS,
              to: existingEntity,
            })
          : createMappedRelationship({
              _class: BINDING_ALLOWS_ANY_RESOURCE_RELATIONSHIP._class,
              _type: generateRelationshipType(
                RelationshipClass.ALLOWS,
                bindingEntities.BINDINGS._type,
                type,
              ),
              _mapping: {
                relationshipDirection: RelationshipDirection.FORWARD,
                sourceEntityKey: bindingEntity._key,
                targetFilterKeys: [
                  // Because there is no one-to-one-mapping from Google Resource Kind to J1 Type, only map on the `_key`.
                  type === MULTIPLE_J1_TYPES_FOR_RESOURCE_KIND
                    ? ['_key']
                    : ['_type', '_key'],
                ],
                /**
                 * The mapper does properly remove mapper-created entities at the moment. These
                 * entities will never be cleaned up which will cause duplicates.
                 *
                 * Until this is fixed, we should not create mapped relationships with target creation
                 * enabled, thus only creating iam_binding relationships to resources that have already
                 * been ingested by other integrations.
                 *
                 * This is a BIG problem because we can no longer tell a customer with 100% confidence
                 * that they do not have any insecure resources if they have yet to have an integration
                 * ingest that resource.
                 */
                skipTargetCreation: true,
                targetEntity: {
                  // When there is no one-to-one-mapping from Google Resource Kind to J1 Type, do not set the _type on target entities.
                  _type:
                    type === MULTIPLE_J1_TYPES_FOR_RESOURCE_KIND
                      ? undefined
                      : type,
                  _key: key,
                  resourceIdentifier: bindingEntity.resource,
                },
              },
            }),
      );
    },
  );
}

export const cloudAssetSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: STEP_IAM_BINDINGS,
    name: 'IAM Bindings',
    entities: [bindingEntities.BINDINGS],
    relationships: [],
    dependsOn: [],
    executionHandler: fetchIamBindings,
    dependencyGraphId: 'last',
  },
  {
    id: STEP_CREATE_BASIC_ROLES,
    name: 'Identity and Access Management (IAM) Basic Roles',
    entities: [
      {
        resourceName: 'IAM Basic Role',
        _type: IAM_ROLE_ENTITY_TYPE,
        _class: IAM_ROLE_ENTITY_CLASS,
      },
    ],
    relationships: [],
    executionHandler: createBasicRolesForBindings,
    dependsOn: [STEP_IAM_BINDINGS],
    dependencyGraphId: 'last',
  },
  {
    id: STEP_CREATE_BINDING_PRINCIPAL_RELATIONSHIPS,
    name: 'IAM Binding Principal Relationships',
    entities: [],
    relationships: [...BINDING_ASSIGNED_PRINCIPAL_RELATIONSHIPS],
    dependsOn: [STEP_IAM_BINDINGS, STEP_CREATE_BASIC_ROLES],
    executionHandler: createPrincipalRelationships,
    dependencyGraphId: 'last',
  },
  {
    id: STEP_CREATE_BINDING_ROLE_RELATIONSHIPS,
    name: 'IAM Binding IAM Role Relationships',
    entities: [],
    relationships: [
      {
        _class: RelationshipClass.USES,
        _type: generateRelationshipType(
          RelationshipClass.USES,
          bindingEntities.BINDINGS._type,
          IAM_ROLE_ENTITY_TYPE,
        ),
        sourceType: bindingEntities.BINDINGS._type,
        targetType: IAM_ROLE_ENTITY_TYPE,
      },
    ],
    dependsOn: [STEP_IAM_BINDINGS, STEP_CREATE_BASIC_ROLES],
    executionHandler: createBindingRoleRelationships,
    dependencyGraphId: 'last',
  },
  {
    id: STEP_CREATE_BINDING_ANY_RESOURCE_RELATIONSHIPS,
    name: 'Role Binding to Any Resource Relationships',
    entities: [],
    relationships: [BINDING_ALLOWS_ANY_RESOURCE_RELATIONSHIP],
    dependsOn: [STEP_IAM_BINDINGS],
    executionHandler: createBindingToAnyResourceRelationships,
    dependencyGraphId: 'last',
  },
];
